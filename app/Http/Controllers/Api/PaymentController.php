<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\PaymentReceipt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class PaymentController extends Controller
{
    private const CUSTOMER_LOOKUP_FAILURE = "We couldn't verify this booking. Check the reference and last 4 digits, then try again.";
    private const ORGANIZER_ROLE = 'Event Coordinator';

    public function store(Request $request, string $reference): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', 'string', 'in:GCash,Maya,Bank Transfer,Cash Deposit'],
            'transaction_number' => ['required', 'string', 'max:120'],
            'amount' => ['required', 'integer', 'min:100'],
            'receipt' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
        ]);

        $bookingId = $request->session()->get('tikim.verified_booking_id');
        $booking = $bookingId ? Booking::find($bookingId) : null;
        $normalizedReference = strtoupper(trim($reference));

        if (
            !$booking ||
            !hash_equals(strtoupper($booking->reference), $normalizedReference)
        ) {
            return response()->json(['message' => self::CUSTOMER_LOOKUP_FAILURE], 404);
        }

        $receiptFile = $validated['receipt'];
        $receiptHash = hash_file('sha256', $receiptFile->getRealPath());

        if ($receiptHash === false) {
            throw new RuntimeException('Unable to verify the uploaded receipt.');
        }

        $storedPath = null;

        try {
            $payment = DB::transaction(function () use (
                $bookingId,
                $normalizedReference,
                $validated,
                $receiptFile,
                $receiptHash,
                &$storedPath
            ): Payment {
                $lockedBooking = Booking::query()->lockForUpdate()->find($bookingId);

                if (
                    !$lockedBooking ||
                    !hash_equals(strtoupper($lockedBooking->reference), $normalizedReference)
                ) {
                    abort(404, self::CUSTOMER_LOOKUP_FAILURE);
                }

                if ($lockedBooking->status === 'Cancelled') {
                    abort(409, 'Payments cannot be submitted for a cancelled booking.');
                }

                if ($lockedBooking->status === 'Expired') {
                    abort(409, 'Payments cannot be submitted for an expired booking.');
                }

                if (
                    $lockedBooking->status === 'Hold (48 Hours)' &&
                    $lockedBooking->hold_expires_at &&
                    now()->gt($lockedBooking->hold_expires_at)
                ) {
                    abort(409, 'The payment submission deadline for this booking has passed.');
                }

                $balance = max(0, (int) $lockedBooking->total_amount - (int) $lockedBooking->amount_paid);
                $submittedAmount = (int) $validated['amount'];

                if ($balance === 0 || $submittedAmount > $balance) {
                    throw ValidationException::withMessages([
                        'amount' => ['The payment amount cannot exceed the current outstanding balance.'],
                    ]);
                }

                if ($lockedBooking->booking_type === 'trays' && $submittedAmount !== $balance) {
                    throw ValidationException::withMessages([
                        'amount' => ['Food Trays bookings require full payment of the outstanding balance.'],
                    ]);
                }

                $remainingDownpayment = max(
                    0,
                    (int) $lockedBooking->downpayment_amount - (int) $lockedBooking->amount_paid
                );

                if (
                    $lockedBooking->booking_type !== 'trays' &&
                    $remainingDownpayment > 0 &&
                    $submittedAmount < $remainingDownpayment
                ) {
                    throw ValidationException::withMessages([
                        'amount' => ['The payment must cover the remaining required downpayment.'],
                    ]);
                }

                if ($lockedBooking->payments()->where('status', 'Pending Verification')->exists()) {
                    abort(409, 'A payment for this booking is already awaiting verification.');
                }

                if (PaymentReceipt::query()
                    ->where('sha256_hash', $receiptHash)
                    ->lockForUpdate()
                    ->exists()) {
                    throw ValidationException::withMessages([
                        'receipt' => ['This receipt has already been submitted.'],
                    ]);
                }

                $transactionNumber = trim($validated['transaction_number']);
                $duplicateTransaction = Payment::query()
                    ->where('payment_method', $validated['payment_method'])
                    ->whereRaw('LOWER(transaction_number) = ?', [mb_strtolower($transactionNumber)])
                    ->lockForUpdate()
                    ->exists();

                if ($duplicateTransaction) {
                    throw ValidationException::withMessages([
                        'transaction_number' => ['This transaction reference has already been submitted.'],
                    ]);
                }

                $storedPath = $receiptFile->store('payment-receipts', 'local');

                if (!$storedPath) {
                    throw new RuntimeException('Unable to store the uploaded receipt securely.');
                }

                $paymentType = $lockedBooking->booking_type === 'trays'
                    ? 'Full Payment'
                    : ($lockedBooking->amount_paid < $lockedBooking->downpayment_amount
                        ? 'Downpayment'
                        : 'Balance Payment');

                $payment = $lockedBooking->payments()->create([
                    'reference' => 'PAY-' . strtoupper((string) Str::uuid()),
                    'payment_type' => $paymentType,
                    'payment_method' => $validated['payment_method'],
                    'amount' => $submittedAmount,
                    'status' => 'Pending Verification',
                    'transaction_number' => $transactionNumber,
                    'submitted_at' => now(),
                ]);

                $payment->receipts()->create([
                    'original_filename' => mb_substr($receiptFile->getClientOriginalName(), 0, 255),
                    'stored_filename' => basename($storedPath),
                    'storage_path' => $storedPath,
                    'mime_type' => $receiptFile->getMimeType() ?: 'application/octet-stream',
                    'file_size' => $receiptFile->getSize(),
                    'sha256_hash' => $receiptHash,
                ]);

                $payment->logs()->create([
                    'action' => 'Submitted',
                    'new_status' => 'Pending Verification',
                    'remarks' => 'Customer submitted payment proof.',
                ]);

                return $payment;
            });
        } catch (Throwable $exception) {
            if ($storedPath) {
                Storage::disk('local')->delete($storedPath);
            }

            throw $exception;
        }

        return response()->json([
            'payment' => [
                'status' => $payment->status,
                'amount' => (int) $payment->amount,
                'submittedAt' => $payment->submitted_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function pending(Request $request): JsonResponse
    {
        if ($response = $this->organizerAuthorizationFailure($request)) {
            return $response;
        }

        $payments = Payment::query()
            ->where('status', 'Pending Verification')
            ->with(['booking', 'receipts'])
            ->orderBy('submitted_at')
            ->get()
            ->map(fn (Payment $payment) => [
                'id' => $payment->id,
                'amount' => (int) $payment->amount,
                'status' => $payment->status,
                'paymentMethod' => $payment->payment_method,
                'transactionNumber' => $payment->transaction_number,
                'submittedAt' => $payment->submitted_at?->toIso8601String(),
                'receipts' => $payment->receipts->map(fn (PaymentReceipt $receipt) => [
                    'id' => $receipt->id,
                    'originalFilename' => $receipt->original_filename,
                    'mimeType' => $receipt->mime_type,
                    'fileSize' => (int) $receipt->file_size,
                ])->values(),
                'booking' => [
                    'id' => $payment->booking->id,
                    'reference' => $payment->booking->reference,
                    'type' => $payment->booking->booking_type,
                    'customerName' => $payment->booking->customer_name,
                    'customerMobile' => $payment->booking->customer_mobile,
                    'eventDate' => $payment->booking->event_date?->toDateString(),
                    'total' => (int) $payment->booking->total_amount,
                    'amountPaid' => (int) $payment->booking->amount_paid,
                    'balance' => max(
                        0,
                        (int) $payment->booking->total_amount - (int) $payment->booking->amount_paid
                    ),
                    'status' => $payment->booking->status,
                ],
            ]);

        return response()->json(['payments' => $payments]);
    }

    public function receipt(Request $request, PaymentReceipt $receipt)
    {
        if ($response = $this->organizerAuthorizationFailure($request)) {
            return $response;
        }

        abort_unless(Storage::disk('local')->exists($receipt->storage_path), 404, 'Receipt not found.');

        $filename = preg_replace(
            '/[^A-Za-z0-9._-]/',
            '_',
            basename($receipt->original_filename)
        ) ?: 'receipt';

        return response()->file(
            Storage::disk('local')->path($receipt->storage_path),
            [
                'Content-Type' => $receipt->mime_type,
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
                'X-Content-Type-Options' => 'nosniff',
            ]
        );
    }

    public function approve(Request $request, Payment $payment): JsonResponse
    {
        if ($response = $this->organizerAuthorizationFailure($request)) {
            return $response;
        }

        return $this->review($request, $payment, true, null);
    }

    public function reject(Request $request, Payment $payment): JsonResponse
    {
        if ($response = $this->organizerAuthorizationFailure($request)) {
            return $response;
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        return $this->review($request, $payment, false, trim($validated['reason']));
    }

    private function review(
        Request $request,
        Payment $payment,
        bool $approve,
        ?string $reason
    ): JsonResponse {
        $result = DB::transaction(function () use ($request, $payment, $approve, $reason): array {
            $booking = Booking::query()->lockForUpdate()->findOrFail($payment->booking_id);
            $lockedPayment = Payment::query()->lockForUpdate()->findOrFail($payment->id);

            if ($lockedPayment->status !== 'Pending Verification') {
                abort(409, 'This payment has already been reviewed.');
            }

            if ((int) $lockedPayment->booking_id !== (int) $booking->id) {
                abort(409, 'This payment is no longer associated with its booking.');
            }

            $now = now();
            $previousStatus = $lockedPayment->status;

            if ($approve) {
                if ($booking->status === 'Cancelled') {
                    abort(409, 'Payments for a cancelled booking cannot be approved.');
                }

                if ($booking->status === 'Expired') {
                    abort(409, 'Payments for an expired booking cannot be approved.');
                }

                if (!$lockedPayment->receipts()->exists()) {
                    abort(409, 'A payment without an uploaded receipt cannot be approved.');
                }

                $amountPaid = (int) $booking->amount_paid + (int) $lockedPayment->amount;
                $balance = max(0, (int) $booking->total_amount - $amountPaid);

                if ((int) $lockedPayment->amount > (int) $booking->total_amount - (int) $booking->amount_paid) {
                    abort(409, 'The payment exceeds the current outstanding balance.');
                }

                $lockedPayment->status = 'Approved';
                $lockedPayment->reviewed_by = $request->user()->id;
                $lockedPayment->reviewed_at = $now;
                $lockedPayment->verified_at = $now;
                $lockedPayment->admin_remarks = null;
                $lockedPayment->save();

                $booking->amount_paid = $amountPaid;
                $booking->balance_amount = $balance;

                if ($balance === 0) {
                    $booking->status = 'Fully Paid';
                    $booking->confirmed_at ??= $now;
                } elseif ($booking->booking_type === 'trays') {
                    $booking->status = 'Partially Paid';
                } elseif ($amountPaid >= (int) $booking->downpayment_amount) {
                    $booking->status = 'Confirmed';
                    $booking->confirmed_at ??= $now;
                }

                $booking->save();

                $lockedPayment->logs()->create([
                    'performed_by' => $request->user()->id,
                    'action' => 'Approved',
                    'previous_status' => $previousStatus,
                    'new_status' => 'Approved',
                    'remarks' => 'Payment approved by organizer.',
                ]);
            } else {
                $lockedPayment->status = 'Rejected';
                $lockedPayment->reviewed_by = $request->user()->id;
                $lockedPayment->reviewed_at = $now;
                $lockedPayment->admin_remarks = $reason;
                $lockedPayment->save();

                $lockedPayment->logs()->create([
                    'performed_by' => $request->user()->id,
                    'action' => 'Rejected',
                    'previous_status' => $previousStatus,
                    'new_status' => 'Rejected',
                    'remarks' => $reason,
                ]);
            }

            return [
                'payment' => $lockedPayment,
                'booking' => $booking,
            ];
        });

        return response()->json([
            'payment' => [
                'id' => $result['payment']->id,
                'status' => $result['payment']->status,
                'amount' => (int) $result['payment']->amount,
                'reviewedAt' => $result['payment']->reviewed_at?->toIso8601String(),
            ],
            'booking' => [
                'reference' => $result['booking']->reference,
                'status' => $result['booking']->status,
                'amountPaid' => (int) $result['booking']->amount_paid,
                'balance' => (int) $result['booking']->balance_amount,
            ],
        ]);
    }

    private function organizerAuthorizationFailure(Request $request): ?JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json(['message' => 'You are not authorized to manage payments.'], 403);
        }

        return null;
    }
}
