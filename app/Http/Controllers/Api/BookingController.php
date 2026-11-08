<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\DateLock;
use App\Models\Hold;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class BookingController extends Controller
{
    private const CUSTOMER_LOOKUP_FAILURE = "We couldn't verify this booking. Check the reference and last 4 digits, then try again.";
    private const ORGANIZER_ROLE = 'Event Coordinator';

    public function createAdminManual(Request $request): JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to create manual bookings.',
            ], 403);
        }

        $type = $request->input('type');
        $validated = $request->validate($this->manualBookingRules($type));

        $payload = $validated;
        $payload['pax'] = (int) ($validated['pax'] ?? 0);

        try {
            return DB::transaction(function () use ($request, $payload, $type): JsonResponse {
                if ($type !== 'trays') {
                    $date = $payload['eventDate'];
                    $now = now();
                    $lock = DateLock::query()
                        ->whereDate('event_date', $date)
                        ->first();

                    if ($lock && $lock->lock_type === 'hold') {
                        $existingHold = Hold::find($lock->hold_id);
                        if (!$existingHold || $existingHold->expires_at->lte($now)) {
                            if ($existingHold) {
                                $existingHold->update([
                                    'status' => 'expired',
                                    'released_at' => $now,
                                ]);
                            }
                            $lock->delete();
                            $lock = null;
                        }
                    }

                    if ($lock) {
                        abort(409, 'This date is no longer available. Please select another date.');
                    }

                    // The unique date_locks.event_date index arbitrates concurrent inserts.
                    $token = Str::random(40);
                    $expiresAt = $now->copy()->addHours(48);
                    $hold = Hold::create([
                        'session_token' => $token,
                        'event_date' => $date,
                        'status' => 'active',
                        'expires_at' => $expiresAt,
                    ]);
                    DateLock::create([
                        'event_date' => $date,
                        'lock_type' => 'hold',
                        'hold_id' => $hold->id,
                        'expires_at' => $expiresAt,
                    ]);
                    $payload['session_token'] = $token;
                }

                $request->replace($payload);
                $response = $this->store($request);
                if ($response->getStatusCode() >= 400) {
                    throw new HttpResponseException($response);
                }

                return $response;
            });
        } catch (UniqueConstraintViolationException) {
            return response()->json([
                'message' => 'This date is no longer available. Please select another date.',
            ], 409);
        }
    }

    public function previewAdminManual(Request $request): JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to preview manual bookings.',
            ], 403);
        }

        $type = $request->input('type');
        $validated = $request->validate($this->manualBookingRules($type, true));
        $validated['customerName'] = 'Manual booking price preview';
        $validated['mobile'] = '0000000000';
        $validated['eventDate'] = $validated['eventDate'] ?? now()->toDateString();
        $validated['pax'] = (int) ($validated['pax'] ?? 0);

        $request->replace($validated);
        $request->attributes->set('manual_booking_preview', true);
        $response = $this->store($request);

        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        $data = $response->getData(true);
        return response()->json(['preview' => $data['booking']['preview'] ?? []]);
    }

    private function manualBookingRules(?string $type, bool $preview = false): array
    {
        return [
            'type' => ['required', 'in:event,food,trays'],
            'customerName' => $preview
                ? ['nullable', 'string', 'max:160']
                : ['required', 'string', 'max:160'],
            'mobile' => $preview
                ? ['nullable', 'string', 'max:30']
                : ['required', 'string', 'max:30'],
            'eventDate' => $preview
                ? ['nullable', 'date_format:Y-m-d']
                : ['required', 'date_format:Y-m-d'],
            'pax' => $type === 'trays'
                ? ['nullable', 'integer', 'min:0', 'max:5000']
                : ['required', 'integer', 'min:1', 'max:5000'],
            'packageId' => $type === 'event'
                ? ['required', 'string', 'max:100']
                : ['nullable', 'string', 'max:100'],
            'level' => in_array($type, ['event', 'food'], true)
                ? ['required', 'integer', 'between:1,3']
                : ['nullable', 'integer', 'between:1,3'],
            'dishes' => ['sometimes', 'array', 'max:100'],
            'dishes.*' => ['required', 'string', 'max:160'],
            'extraDishes' => ['sometimes', 'array', 'max:50'],
            'extraDishes.*' => ['required', 'array:name,category'],
            'extraDishes.*.name' => ['required', 'string', 'max:160'],
            'extraDishes.*.category' => ['required', 'string', 'max:80'],
            'specialDishes' => ['sometimes', 'array', 'max:50'],
            'specialDishes.*' => ['required', 'array:name'],
            'specialDishes.*.name' => ['required', 'string', 'max:160'],
            'addOns' => ['sometimes', 'array', 'max:100'],
            'addOns.*' => ['required', 'array:id,quantity'],
            'addOns.*.id' => ['required', 'string', 'max:100'],
            'addOns.*.quantity' => ['required', 'integer', 'min:1', 'max:1000'],
            'trays' => ['sometimes', 'array', 'max:100'],
            'trays.*' => ['required', 'array:id,qty'],
            'trays.*.id' => ['required', 'string', 'max:100'],
            'trays.*.qty' => ['required', 'integer', 'min:1', 'max:1000'],
            'eventTime' => ['nullable', 'string', 'max:40'],
            'venue' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'contactMethod' => ['nullable', 'string', 'max:40'],
            'messengerName' => ['nullable', 'string', 'max:160'],
            'fulfillment' => ['nullable', 'string', 'max:30'],
            'deliveryNotes' => ['nullable', 'string', 'max:5000'],
            'reference' => ['prohibited'],
            'ref' => ['prohibited'],
            'price' => ['prohibited'],
            'unit_price' => ['prohibited'],
            'subtotal' => ['prohibited'],
            'discount' => ['prohibited'],
            'total' => ['prohibited'],
            'total_amount' => ['prohibited'],
            'downpayment' => ['prohibited'],
            'downpayment_amount' => ['prohibited'],
            'amount_paid' => ['prohibited'],
            'payment_amount' => ['prohibited'],
            'status' => ['prohibited'],
            'hold_expires_at' => ['prohibited'],
            'holdExpiresAt' => ['prohibited'],
            'session_token' => ['prohibited'],
        ];
    }

    public function adminIndex(Request $request)
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to manage bookings.',
            ], 403);
        }

        $bookings = Booking::query()
            ->select([
                'id',
                'reference',
                'customer_name',
                'customer_mobile',
                'booking_type',
                'event_date',
                'guest_count',
                'status',
                'total_amount',
                'amount_paid',
                'balance_amount',
                'created_at',
            ])
            ->withSum([
                'payments as approved_amount_paid' => fn ($query) => $query->where('status', 'Approved'),
            ], 'amount')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Booking $booking) => [
                'id' => $booking->id,
                'ref' => $booking->reference,
                'customer' => [
                    'name' => $booking->customer_name,
                    'mobile' => $booking->customer_mobile,
                ],
                'type' => $booking->booking_type,
                'eventDate' => $booking->event_date?->toDateString(),
                'pax' => $booking->guest_count === null ? null : (int) $booking->guest_count,
                'status' => $booking->status,
                'total' => (int) $booking->total_amount,
                'paidAmount' => (int) ($booking->approved_amount_paid ?? $booking->amount_paid),
                'balance' => max(0, (int) $booking->total_amount - (int) ($booking->approved_amount_paid ?? $booking->amount_paid)),
                'createdAt' => $booking->created_at?->toIso8601String(),
            ])
            ->values();

        return response()->json(['bookings' => $bookings]);
    }

    public function showAdminQuote(Request $request, Booking $booking): JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to manage booking quotes.',
            ], 403);
        }

        return response()->json([
            'booking' => $this->adminQuotePayload($booking),
        ]);
    }

    public function updateAdminQuote(Request $request, Booking $booking): JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to manage booking quotes.',
            ], 403);
        }

        $validated = $request->validate([
            'line_overrides' => ['sometimes', 'array', 'max:100'],
            'line_overrides.*' => ['required', 'array:booking_item_id,unit_price'],
            'line_overrides.*.booking_item_id' => ['required', 'integer', 'distinct'],
            'line_overrides.*.unit_price' => ['required', 'integer', 'min:0', 'max:9007199254740991'],
            'discount' => ['required', 'integer', 'min:0', 'max:9007199254740991'],
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
            'subtotal' => ['prohibited'],
            'total' => ['prohibited'],
            'total_amount' => ['prohibited'],
            'downpayment' => ['prohibited'],
            'downpayment_amount' => ['prohibited'],
            'amount_paid' => ['prohibited'],
            'balance' => ['prohibited'],
            'balance_amount' => ['prohibited'],
        ]);

        $validated['reason'] = trim($validated['reason']);
        if ($validated['reason'] === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'reason' => ['A revision reason is required.'],
            ]);
        }

        $result = DB::transaction(function () use ($request, $booking, $validated): Booking {
            $lockedBooking = Booking::query()
                ->lockForUpdate()
                ->findOrFail($booking->id);

            if (in_array($lockedBooking->status, ['Cancelled', 'Expired', 'Completed'], true)) {
                abort(409, 'Quotes can only be revised for active bookings.');
            }

            $payments = $lockedBooking->payments()
                ->lockForUpdate()
                ->get(['amount', 'status']);

            if ($payments->contains(
                fn ($payment): bool => $payment->status === 'Pending Verification'
            )) {
                abort(409, 'This quote cannot be revised while a payment is awaiting verification.');
            }

            $approvedAmount = (int) $payments
                ->where('status', 'Approved')
                ->sum('amount');

            $items = $lockedBooking->items()
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            if ($items->isEmpty()) {
                abort(409, 'This booking has no persisted quote items and cannot be safely revised.');
            }

            [$snapshot, $snapshotLines] = $this->snapshotLinesWithItemIds($lockedBooking, $items);
            $snapshotPercent = $snapshot['downpayment_percent'] ?? null;
            if (
                $lockedBooking->booking_type !== 'trays' &&
                (!is_numeric($snapshotPercent) || (float) $snapshotPercent < 0 || (float) $snapshotPercent > 100)
            ) {
                abort(409, 'This booking has no reliable stored downpayment percentage. Its quote cannot be safely revised.');
            }

            $linesByItemId = collect($snapshotLines)->keyBy('booking_item_id');
            $itemsById = $items->keyBy('id');

            foreach ($validated['line_overrides'] ?? [] as $override) {
                $itemId = (int) $override['booking_item_id'];
                $item = $itemsById->get($itemId);
                $line = $linesByItemId->get($itemId);

                if (!$item || !$line || !$this->isQuoteableItem($item)) {
                    abort(422, 'One or more quote lines are not eligible for price updates.');
                }

                $unitPrice = (int) $override['unit_price'];
                $quantity = (int) $item->quantity;
                if ($quantity > 0 && $unitPrice > intdiv(PHP_INT_MAX, $quantity)) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'line_overrides' => ['A quote line price exceeds the supported range.'],
                    ]);
                }
                $lineTotal = $unitPrice * $quantity;
                $details = $item->details ?? [];
                $details['price_status'] = $unitPrice === 0 ? 'tbc' : 'confirmed';

                $item->unit_price = $unitPrice;
                $item->line_total = $lineTotal;
                $item->details = $details;
                $item->save();

                $line['unit_price'] = $unitPrice;
                $line['amount'] = $lineTotal;
                $line['details'] = $details;
                $line['booking_item_id'] = $itemId;
                $linesByItemId->put($itemId, $line);
            }

            $snapshotLines = $linesByItemId->sortKeys()->values()->all();
            $subtotal = (int) $items->sum('line_total');
            $discount = (int) $validated['discount'];

            if ($discount > $subtotal) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'discount' => ['The discount cannot exceed the quote subtotal.'],
                ]);
            }

            $total = $subtotal - $discount;
            if ($total < $approvedAmount) {
                abort(409, 'The revised total cannot be lower than the approved payment total.');
            }

            $oldTotal = (int) $lockedBooking->total_amount;
            $downpaymentPercent = $lockedBooking->booking_type === 'trays'
                ? 100
                : (float) $snapshotPercent;
            $downpayment = (int) round($total * $downpaymentPercent / 100);
            $balance = $total - $approvedAmount;

            $history = is_array($snapshot['quote_revisions'] ?? null)
                ? $snapshot['quote_revisions']
                : [];
            $history[] = [
                'reason' => $validated['reason'],
                'revised_by' => (int) $request->user()->id,
                'revised_at' => now()->toIso8601String(),
                'previous' => [
                    'subtotal' => (int) $lockedBooking->subtotal,
                    'discount' => (int) $lockedBooking->discount,
                    'total_amount' => $oldTotal,
                    'downpayment_amount' => (int) $lockedBooking->downpayment_amount,
                    'amount_paid' => (int) $lockedBooking->amount_paid,
                    'balance_amount' => (int) $lockedBooking->balance_amount,
                    'lines' => $snapshot['lines'] ?? [],
                ],
            ];

            $snapshot['lines'] = $snapshotLines;
            $snapshot['discount'] = $discount;
            $snapshot['downpayment_percent'] = $downpaymentPercent;
            $snapshot['quote_revisions'] = $history;
            $snapshot['tbc'] = collect($snapshotLines)->contains(
                fn (array $line): bool => (($line['details']['price_status'] ?? null) === 'tbc')
            );
            $snapshot['estimate'] = collect($snapshotLines)->contains(
                fn (array $line): bool => (($line['details']['price_status'] ?? null) === 'estimate')
            );

            $lockedBooking->subtotal = $subtotal;
            $lockedBooking->discount = $discount;
            $lockedBooking->total_amount = $total;
            $lockedBooking->downpayment_amount = $downpayment;
            $lockedBooking->amount_paid = $approvedAmount;
            $lockedBooking->balance_amount = $balance;
            $lockedBooking->pricing_snapshot = $snapshot;
            $lockedBooking->save();

            return $lockedBooking->fresh();
        });

        return response()->json([
            'message' => 'Booking quote updated.',
            'booking' => $this->adminQuotePayload($result),
        ]);
    }

    private function adminQuotePayload(Booking $booking): array
    {
        $booking->loadMissing('payments');
        $items = $booking->items()->orderBy('id')->get();
        [$snapshot, $lines] = $this->snapshotLinesWithItemIds($booking, $items);
        $paidAmount = $this->approvedPaymentAmount($booking);

        return [
            'id' => (string) $booking->id,
            'ref' => $booking->reference,
            'type' => $booking->booking_type,
            'status' => $booking->status,
            'eventDate' => $booking->event_date?->toDateString(),
            'total' => (int) $booking->total_amount,
            'subtotal' => (int) $booking->subtotal,
            'discount' => (int) $booking->discount,
            'downpaymentRequired' => (int) $booking->downpayment_amount,
            'downpaymentPercent' => $snapshot['downpayment_percent'] ?? null,
            'paidAmount' => $paidAmount,
            'balance' => max(0, (int) $booking->total_amount - $paidAmount),
            'quoteSnapshot' => [
                'lines' => array_map(fn (array $line) => [
                    'bookingItemId' => (int) $line['booking_item_id'],
                    'name' => $line['name'],
                    'category' => $this->quoteCategory($line['item_type'] ?? ''),
                    'quantity' => (int) $line['quantity'],
                    'unitPrice' => (int) $line['unit_price'],
                    'amount' => (int) $line['amount'],
                    'isTbc' => (($line['details']['price_status'] ?? null) === 'tbc'),
                    'isEstimate' => (($line['details']['price_status'] ?? null) === 'estimate'),
                    'formula' => '',
                ], $lines),
                'hasTbc' => (bool) ($snapshot['tbc'] ?? false),
                'hasEstimate' => (bool) ($snapshot['estimate'] ?? false),
                'revisions' => $snapshot['quote_revisions'] ?? [],
            ],
        ];
    }

    private function snapshotLinesWithItemIds(Booking $booking, $items): array
    {
        $snapshot = $booking->pricing_snapshot ?? [];
        $lines = is_array($snapshot['lines'] ?? null) ? $snapshot['lines'] : [];

        if (!$lines && $items->isNotEmpty()) {
            $lines = $items->map(fn ($item) => [
                'name' => $item->item_name,
                'item_type' => $item->item_type,
                'unit_price' => (int) $item->unit_price,
                'quantity' => (int) $item->quantity,
                'amount' => (int) $item->line_total,
                'details' => $item->details ?? [],
                'catalog_type' => $item->catalog_type,
                'catalog_id' => $item->catalog_id,
                'code' => $item->item_code,
            ])->all();
        }

        $unusedItems = $items->keyBy('id');
        foreach ($lines as $index => &$line) {
            if (!is_array($line)) {
                abort(409, 'The stored quote contains an invalid line and cannot be safely revised.');
            }

            $item = null;
            $explicitId = (int) ($line['booking_item_id'] ?? 0);
            if ($explicitId > 0) {
                $item = $unusedItems->get($explicitId);
            } else {
                $candidates = $unusedItems->filter(fn ($candidate) =>
                    $candidate->item_type === ($line['item_type'] ?? null) &&
                    $candidate->item_name === ($line['name'] ?? null) &&
                    $candidate->catalog_type === ($line['catalog_type'] ?? null) &&
                    (int) $candidate->catalog_id === (int) ($line['catalog_id'] ?? 0) &&
                    $candidate->item_code === ($line['code'] ?? null) &&
                    (int) $candidate->quantity === (int) ($line['quantity'] ?? 0) &&
                    (int) $candidate->unit_price === (int) ($line['unit_price'] ?? 0) &&
                    (int) $candidate->line_total === (int) ($line['amount'] ?? 0)
                );
                $item = $candidates->first();
            }

            if (!$item) {
                abort(409, 'Stored quote lines cannot be matched safely to their booking items.');
            }

            $line['booking_item_id'] = (int) $item->id;
            unset($unusedItems[$item->id]);
        }
        unset($line);

        if ($unusedItems->isNotEmpty() || count($lines) !== $items->count()) {
            abort(409, 'Stored quote lines do not match the booking item records.');
        }

        $snapshot['lines'] = $lines;

        return [$snapshot, $lines];
    }

    private function isQuoteableItem($item): bool
    {
        $details = $item->details ?? [];

        return in_array($item->item_type, ['add_on', 'special_dish'], true)
            || in_array($details['price_status'] ?? null, ['tbc', 'estimate'], true)
            || (int) $item->line_total === 0;
    }

    private function quoteCategory(string $itemType): string
    {
        return match ($itemType) {
            'add_on' => 'Add-on',
            'special_dish' => 'Special Dish',
            default => ucfirst(str_replace('_', ' ', $itemType)),
        };
    }

    public function updateAdminStatus(Request $request, Booking $booking): JsonResponse
    {
        if ($request->user()?->role !== self::ORGANIZER_ROLE) {
            return response()->json([
                'message' => 'You are not authorized to manage bookings.',
            ], 403);
        }

        $validated = $request->validate([
            'action' => ['required', 'string', 'in:cancel,complete,reopen'],
        ]);

        try {
            $result = DB::transaction(function () use ($request, $booking, $validated): array {
                $lockedBooking = Booking::query()
                    ->lockForUpdate()
                    ->findOrFail($booking->id);
                $action = $validated['action'];
                $now = now();
                $warning = null;

                if ($action === 'cancel') {
                    if (in_array($lockedBooking->status, ['Completed', 'Cancelled', 'Expired'], true)) {
                        abort(409, 'Completed, cancelled, or expired bookings cannot be cancelled.');
                    }

                    $payments = $lockedBooking->payments()
                        ->lockForUpdate()
                        ->get(['amount', 'status']);

                    if ($payments->contains(
                        fn ($payment): bool => $payment->status === 'Pending Verification'
                    )) {
                        abort(409, 'This booking cannot be cancelled while a payment is awaiting verification.');
                    }

                    $hasApprovedPayments = $payments->contains(
                        fn ($payment): bool => $payment->status === 'Approved'
                    );

                    $lockedBooking->status = 'Cancelled';
                    $lockedBooking->save();

                    $lockedBooking->dateLock()
                        ->where('lock_type', 'booking')
                        ->where('booking_id', $lockedBooking->id)
                        ->delete();

                    if ($hasApprovedPayments) {
                        $warning = 'Approved payment history remains recorded. No refund was processed automatically.';
                    }
                } elseif ($action === 'complete') {
                    if (in_array($lockedBooking->status, ['Completed', 'Cancelled', 'Expired'], true)) {
                        abort(409, 'This booking is not eligible for completion.');
                    }

                    if (!$lockedBooking->event_date || $lockedBooking->event_date->isFuture()) {
                        abort(409, 'A booking can only be completed on or after its event date.');
                    }

                    $lockedBooking->status = 'Completed';
                    $lockedBooking->completed_at = $now;
                    $lockedBooking->save();
                } else {
                    if (!in_array($lockedBooking->status, ['Cancelled', 'Expired'], true)) {
                        abort(409, 'Only cancelled or expired bookings can be reopened.');
                    }

                    if (!in_array($lockedBooking->booking_type, ['event', 'food', 'trays'], true)) {
                        abort(409, 'This booking type cannot be safely reopened.');
                    }

                    if (!$lockedBooking->event_date) {
                        abort(409, 'This booking has no event date and cannot be reopened.');
                    }

                    $eventDate = $lockedBooking->event_date->toDateString();
                    $otherActiveBooking = Booking::query()
                        ->whereDate('event_date', $eventDate)
                        ->where('id', '<>', $lockedBooking->id)
                        ->whereNotIn('status', ['Cancelled', 'Expired'])
                        ->lockForUpdate()
                        ->exists();

                    if ($otherActiveBooking) {
                        abort(409, 'Another active booking already occupies this date.');
                    }

                    $activeHolds = Hold::query()
                        ->whereDate('event_date', $eventDate)
                        ->where('status', 'active')
                        ->where('expires_at', '>', $now)
                        ->lockForUpdate()
                        ->get(['id', 'booking_id']);

                    if ($activeHolds->contains(
                        fn ($hold): bool => (int) $hold->booking_id !== (int) $lockedBooking->id
                    )) {
                        abort(409, 'An active temporary hold already occupies this date.');
                    }

                    $dateLock = DateLock::query()
                        ->whereDate('event_date', $eventDate)
                        ->lockForUpdate()
                        ->first();

                    $lockBelongsToBooking = $dateLock && (
                        (int) $dateLock->booking_id === (int) $lockedBooking->id ||
                        (
                            $dateLock->hold_id &&
                            Hold::query()
                                ->whereKey($dateLock->hold_id)
                                ->where('booking_id', $lockedBooking->id)
                                ->exists()
                        )
                    );

                    if ($dateLock && !$lockBelongsToBooking) {
                        abort(409, 'A date lock already occupies this date.');
                    }

                    $payments = $lockedBooking->payments()
                        ->lockForUpdate()
                        ->get(['amount', 'status']);
                    $approvedAmount = $payments
                        ->where('status', 'Approved')
                        ->sum('amount');

                    if (
                        $lockedBooking->booking_type === 'trays' &&
                        $approvedAmount < (int) $lockedBooking->total_amount
                    ) {
                        abort(409, 'Food Trays bookings can only be reopened when approved payments cover the full booking amount.');
                    }

                    if ($lockedBooking->booking_type === 'trays') {
                        $lockedBooking->status = 'Fully Paid';
                    } elseif ($approvedAmount >= (int) $lockedBooking->total_amount) {
                        $lockedBooking->status = 'Fully Paid';
                    } elseif ($approvedAmount >= (int) $lockedBooking->downpayment_amount) {
                        $lockedBooking->status = 'Confirmed';
                    } elseif (in_array($lockedBooking->booking_type, ['event', 'food'], true)) {
                        $lockedBooking->status = 'Hold (48 Hours)';
                        $lockedBooking->hold_expires_at = $now->copy()->addHours(48);
                    } else {
                        abort(409, 'This Food Trays booking does not meet the approved payment requirements for reopening.');
                    }

                    if (in_array($lockedBooking->booking_type, ['event', 'food'], true)) {
                        $ownBookingLock = DateLock::query()
                            ->where('booking_id', $lockedBooking->id)
                            ->lockForUpdate()
                            ->first();

                        if ($ownBookingLock && (int) $ownBookingLock->id !== (int) ($dateLock?->id ?? 0)) {
                            $ownBookingLock->delete();
                        }

                        if ($dateLock && $lockBelongsToBooking) {
                            $dateLock->update([
                                'lock_type' => 'booking',
                                'booking_id' => $lockedBooking->id,
                                'hold_id' => null,
                                'expires_at' => null,
                            ]);
                        } else {
                            DateLock::create([
                                'event_date' => $eventDate,
                                'lock_type' => 'booking',
                                'booking_id' => $lockedBooking->id,
                                'hold_id' => null,
                                'expires_at' => null,
                            ]);
                        }
                    }

                    $lockedBooking->save();
                }

                return [
                    'booking' => $lockedBooking->fresh(),
                    'warning' => $warning,
                ];
            });
        } catch (UniqueConstraintViolationException $exception) {
            $date = $booking->event_date?->toDateString();
            if (
                $validated['action'] === 'reopen' &&
                $date &&
                DateLock::query()->whereDate('event_date', $date)->exists()
            ) {
                return response()->json([
                    'message' => 'A date lock was created concurrently. The booking was not reopened.',
                ], 409);
            }

            throw $exception;
        }

        return response()->json([
            'message' => $result['warning'] ?? 'Booking status updated successfully.',
            'warning' => $result['warning'],
            'booking' => [
                'id' => $result['booking']->id,
                'reference' => $result['booking']->reference,
                'status' => $result['booking']->status,
                'eventDate' => $result['booking']->event_date?->toDateString(),
                'holdExpiresAt' => $result['booking']->hold_expires_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Return public availability for dates in the requested range.
     */
    public function availability(Request $request)
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $from = $validated['from'];
        $to = $validated['to'];
        $now = now();
        $availability = [];

        $dateLocks = DateLock::with(['booking', 'hold'])
            ->whereBetween('event_date', [$from, $to])
            ->get();

        foreach ($dateLocks as $dateLock) {
            $date = $dateLock->event_date->toDateString();

            if ($dateLock->lock_type === 'booking') {
                if (
                    !$dateLock->booking ||
                    !in_array($dateLock->booking->status, ['Cancelled', 'Expired'], true)
                ) {
                    $availability[$date] = ['status' => 'Booked'];
                }

                continue;
            }

            if ($dateLock->lock_type !== 'hold') {
                continue;
            }

            $hold = $dateLock->hold;

            if (
                $hold &&
                $hold->status === 'active' &&
                $hold->event_date->toDateString() === $date &&
                $hold->expires_at->gt($now)
            ) {
                $availability[$date] = [
                    'status' => 'On Hold',
                    'expiresAt' => $hold->expires_at->toIso8601String(),
                ];
            }
        }

        $bookings = Booking::query()
            ->whereBetween('event_date', [$from, $to])
            ->whereNotIn('status', ['Cancelled', 'Expired'])
            ->get(['event_date', 'status', 'hold_expires_at']);

        foreach ($bookings as $booking) {
            if (!$booking->event_date) {
                continue;
            }

            $date = $booking->event_date->toDateString();
            $availability[$date] = ['status' => 'Booked'];
        }

        return response()->json([
            'from' => $from,
            'to' => $to,
            'availability' => (object) $availability,
        ]);
    }

    /**
     * Verify a customer's booking reference and mobile number.
     */
    public function lookup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'reference' => ['required', 'string', 'max:32'],
            'last4' => ['required', 'regex:/^[0-9]{4}$/'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => self::CUSTOMER_LOOKUP_FAILURE,
            ], 422);
        }

        $reference = strtoupper(trim($validator->validated()['reference']));
        $last4 = $validator->validated()['last4'];
        $booking = Booking::where('reference', $reference)->first();

        $mobileDigits = $booking
            ? preg_replace('/\D+/', '', (string) $booking->customer_mobile)
            : '';

        if (
            !$booking ||
            strlen($mobileDigits) < 4 ||
            !hash_equals(substr($mobileDigits, -4), $last4)
        ) {
            return response()->json([
                'message' => self::CUSTOMER_LOOKUP_FAILURE,
            ], 404);
        }

        $request->session()->regenerate();
        $request->session()->put('tikim.verified_booking_id', $booking->id);

        return response()->json([
            'booking' => $this->customerBookingPayload(
                $booking->load(['items', 'menuPicks', 'addOns', 'layout', 'payments'])
            ),
        ]);
    }

    /**
     * Retrieve only the booking verified in this server-side session.
     */
    public function showVerified(Request $request, string $reference)
    {
        $verifiedBookingId = $request->session()->get('tikim.verified_booking_id');
        $booking = $verifiedBookingId
            ? Booking::with(['items', 'menuPicks', 'addOns', 'layout', 'payments'])
                ->find($verifiedBookingId)
            : null;

        if (
            !$booking ||
            !hash_equals(strtoupper($booking->reference), strtoupper(trim($reference)))
        ) {
            return response()->json([
                'message' => self::CUSTOMER_LOOKUP_FAILURE,
            ], 404);
        }

        return response()->json([
            'booking' => $this->customerBookingPayload($booking),
        ]);
    }

    private function customerBookingPayload(Booking $booking): array
    {
        $booking->loadMissing('payments');
        $pendingPayment = $booking->payments->first(
            fn ($payment) => $payment->status === 'Pending Verification'
        );

        $snapshot = $booking->pricing_snapshot ?? [];
        $snapshotLines = is_array($snapshot['lines'] ?? null)
            ? $snapshot['lines']
            : [];
        $items = $booking->items->map(fn ($item) => [
            'name' => $item->item_name,
            'itemType' => $item->item_type,
            'quantity' => (int) $item->quantity,
            'unitPrice' => (int) $item->unit_price,
            'amount' => (int) $item->line_total,
            'details' => $item->details ?? [],
        ])->values();
        $packageItem = $booking->items->first(
            fn ($item) => in_array($item->item_type, ['event_package', 'food_package'], true)
        );
        $typeLabels = [
            'event' => 'Event',
            'food' => 'Food Package',
            'trays' => 'Food Trays',
        ];
        $typeBadge = $typeLabels[$booking->booking_type] ?? 'Catering';
        $mobileDigits = preg_replace('/\D+/', '', (string) $booking->customer_mobile);
        $maskedMobile = strlen($mobileDigits) > 4
            ? str_repeat('*', strlen($mobileDigits) - 4) . substr($mobileDigits, -4)
            : str_repeat('*', strlen($mobileDigits));
        $holdExpiresAt = $booking->booking_type === 'trays'
            ? null
            : $booking->hold_expires_at?->toIso8601String();
        $status = $pendingPayment
            ? 'Pending Verification'
            : $booking->status;

        if (
            $booking->booking_type !== 'trays' &&
            $holdExpiresAt &&
            str_starts_with(strtolower($status), 'hold')
        ) {
            $status = 'Hold';
        }

        $eventTime = $snapshot['eventTime'] ?? null;
        if (!$eventTime && $booking->preferred_start_time) {
            $eventTime = \Illuminate\Support\Carbon::parse($booking->preferred_start_time)->format('h:i A');
        }

        $quoteLines = array_map(static function (array $line): array {
            $details = $line['details'] ?? [];

            return [
                'name' => $line['name'] ?? 'Booking item',
                'formula' => '',
                'amount' => (int) ($line['amount'] ?? 0),
                'isTbc' => ($details['price_status'] ?? null) === 'tbc',
            ];
        }, array_values(array_filter($snapshotLines, 'is_array')));

        $latestPayment = $booking->payments
            ->sortByDesc(fn ($payment) => $payment->submitted_at ?? $payment->created_at)
            ->first();

        $paymentHistory = $booking->payments
            ->sortByDesc(fn ($payment) => $payment->submitted_at ?? $payment->created_at)
            ->map(fn ($payment) => [
                'status' => $payment->status,
                'amount' => (int) $payment->amount,
                'channel' => $payment->payment_method,
                'transactionNo' => $payment->transaction_number,
                'createdAt' => ($payment->submitted_at ?? $payment->created_at)?->toIso8601String(),
                'rejectionReason' => $payment->status === 'Rejected'
                    ? $payment->admin_remarks
                    : null,
            ])->values();

        $customerName = $booking->customer_name;
        $venue = $booking->venue_address ?: $booking->venue_type;
        $customerNotes = $booking->customer_notes;
        $stageText = $snapshot['stageText'] ?? null;
        $packageName = $booking->booking_type === 'trays'
            ? 'Food Trays'
            : ($packageItem?->item_name ?: $booking->occasion);

        return [
            'ref' => $booking->reference,
            'type' => $booking->booking_type,
            'typeBadge' => $typeBadge,
            'tag' => $typeBadge,
            'customerName' => $customerName,
            'mobile' => $maskedMobile,
            'customer' => [
                'name' => $customerName,
                'mobile' => $maskedMobile,
                'deliveryAddress' => $venue,
                'requests' => $customerNotes,
            ],
            'eventDate' => $booking->event_date?->toDateString(),
            'deliveryDate' => $booking->event_date?->toDateString(),
            'eventTime' => $eventTime,
            'deliveryTime' => $eventTime,
            'eventType' => $packageName,
            'venue' => $venue,
            'packageName' => $packageName,
            'pax' => $booking->guest_count === null ? null : (int) $booking->guest_count,
            'trays' => $items->where('itemType', 'tray')->values()->all(),
            'items' => $items->all(),
            'dishes' => $booking->menuPicks->pluck('dish_name')->values()->all(),
            'extraDishes' => collect($snapshotLines)
                ->filter(fn ($line) => ($line['item_type'] ?? null) === 'extra_dish')
                ->map(fn ($line) => ['name' => $line['name'] ?? ''])
                ->values()
                ->all(),
            'specialDishes' => collect($snapshotLines)
                ->filter(fn ($line) => ($line['item_type'] ?? null) === 'special_dish')
                ->map(fn ($line) => ['name' => $line['name'] ?? ''])
                ->values()
                ->all(),
            'addOns' => $booking->addOns->map(fn ($addOn) => [
                'name' => $addOn->add_on_name,
                'quantity' => (int) $addOn->quantity,
                'amount' => (int) $addOn->line_total,
            ])->values()->all(),
            'layout' => $booking->layout?->layout_data,
            'floorPlan' => $booking->layout?->layout_data ?? ($snapshot['floorPlan'] ?? null),
            'stageText' => $stageText,
            'details' => [
                'venue' => $venue,
                'notes' => $customerNotes,
            ],
            'notes' => $customerNotes,
            'total' => (int) $booking->total_amount,
            'downpaymentRequired' => (int) $booking->downpayment_amount,
            'paid' => $this->approvedPaymentAmount($booking),
            'paidAmount' => $this->approvedPaymentAmount($booking),
            'balance' => max(0, (int) $booking->total_amount - $this->approvedPaymentAmount($booking)),
            'status' => $status,
            'rejectionReason' => $latestPayment?->status === 'Rejected'
                ? $latestPayment->admin_remarks
                : null,
            'holdExpiresAt' => $holdExpiresAt,
            'payments' => $paymentHistory->all(),
            'quoteSnapshot' => [
                'lines' => $quoteLines,
                'flags' => [
                    'hasTbc' => (bool) ($snapshot['tbc'] ?? false),
                    'usesEstimates' => (bool) ($snapshot['estimate'] ?? false),
                ],
            ],
        ];
    }

    private function approvedPaymentAmount(Booking $booking): int
    {
        $approvedPayments = $booking->payments->where('status', 'Approved');

        return $approvedPayments->isNotEmpty()
            ? (int) $approvedPayments->sum('amount')
            : (int) $booking->amount_paid;
    }

    /**
     * Create a public customer booking.
     * All prices are calculated using database catalog values.
     */
    public function store(Request $request)
    {
        $isManualPreview = $request->attributes->get('manual_booking_preview') === true;
        $validated = $request->validate([
            'type' => ['required', 'in:event,food,trays'],
            'customerName' => ['required', 'string', 'max:160'],
            'mobile' => ['required', 'string', 'max:30'],
            'eventDate' => ['required', 'date'],
            'session_token' => $isManualPreview
                ? ['nullable', 'string', 'min:32', 'max:100']
                : ['required_if:type,event,food', 'nullable', 'string', 'min:32', 'max:100'],

            'packageId' => ['nullable', 'string', 'max:100'],
            'level' => ['nullable', 'integer', 'between:1,3'],
            'pax' => $request->input('type') === 'trays'
    ? ['nullable', 'integer', 'min:0', 'max:5000']
    : ['required', 'integer', 'min:1', 'max:5000'],

            'dishes' => ['nullable', 'array'],
            'dishes.*' => ['string', 'max:160'],
            'extraDishes' => ['nullable', 'array'],
            'specialDishes' => ['nullable', 'array'],
            'addOns' => ['nullable', 'array'],
            'trays' => ['nullable', 'array'],
            'layout' => ['nullable', 'array'],
        ]);

        try {
            $booking = DB::transaction(function () use ($request, $validated, $isManualPreview) {

                $type = $validated['type'];
                $pax = (int) ($request->input('pax') ?: 0);
                $date = $validated['eventDate'];
                $now = now();

                $pricingSetting = DB::table('system_settings')
                    ->where('setting_key', 'pricing_rules')
                    ->value('setting_value');

                $pricing = is_string($pricingSetting)
                    ? json_decode($pricingSetting, true) ?: []
                    : [];

                $lines = [];
                $subtotal = 0;
                $hasEstimate = false;
                $hasTbc = false;

                $addLine = function (
                    string $name,
                    string $itemType,
                    float $unitPrice,
                    int $quantity,
                    float $amount,
                    array $details = [],
                    ?string $catalogType = null,
                    ?int $catalogId = null,
                    ?string $code = null
                ) use (&$lines, &$subtotal) {
                    $line = [
                        'name' => $name,
                        'item_type' => $itemType,
                        'unit_price' => (int) round($unitPrice),
                        'quantity' => $quantity,
                        'amount' => (int) round($amount),
                        'details' => $details,
                        'catalog_type' => $catalogType,
                        'catalog_id' => $catalogId,
                        'code' => $code,
                    ];

                    $lines[] = $line;
                    $subtotal += $line['amount'];
                };

                // Validate and lock the selected date for event/food bookings.
                $activeHold = null;

                if ($type !== 'trays' && !$isManualPreview) {
                    $token = $validated['session_token'];

                    $activeHold = Hold::where('session_token', $token)
                        ->whereDate('event_date', $date)
                        ->where('status', 'active')
                        ->where('expires_at', '>', $now)
                        ->lockForUpdate()
                        ->latest('id')
                        ->first();

                    if (!$activeHold) {
                        abort(409, 'Your date reservation has expired or is no longer valid. Please select the date again.');
                    }

                    $dateLock = DateLock::whereDate('event_date', $date)
                        ->lockForUpdate()
                        ->first();

                    if (
                        !$dateLock ||
                        $dateLock->lock_type !== 'hold' ||
                        (int) $dateLock->hold_id !== (int) $activeHold->id
                    ) {
                        abort(409, 'This date is no longer available. Please select another date.');
                    }
                }

                // EVENT PACKAGE
                $package = null;

                if ($type === 'event') {
                    $package = DB::table('event_packages')
                        ->where('code', $request->input('packageId'))
                        ->where('is_active', true)
                        ->first();

                    if (!$package) {
                        abort(422, 'The selected event package is unavailable.');
                    }

                    if ($pax < 1) {
                        abort(422, 'Please provide the number of guests.');
                    }

                    $basePrice = (float) $package->base_price;
                    $baseGuests = (int) $package->base_guests;
                    $extraRate = (float) $package->extra_guest_price;

                    $addLine(
                        $package->name,
                        'event_package',
                        $basePrice,
                        1,
                        $basePrice,
                        ['base_guests' => $baseGuests],
                        'event_package',
                        (int) $package->id,
                        $package->code
                    );

                    if ($pax > $baseGuests) {
                        $extraGuests = $pax - $baseGuests;
                        $extraTotal = $extraGuests * $extraRate;

                        $addLine(
                            'Additional Guests',
                            'extra_guests',
                            $extraRate,
                            $extraGuests,
                            $extraTotal,
                            ['base_guests' => $baseGuests]
                        );
                    }

                    if ($package->price_status === 'estimate') {
                        $hasEstimate = true;
                    }
                }

                // FOOD PACKAGE AND EVENT FOOD UPGRADE
                if ($type === 'food' || $type === 'event') {
                    $level = (int) ($request->input('level') ?: 1);

                    $foodPackage = DB::table('food_packages')
                        ->where('level', $level)
                        ->where('is_active', true)
                        ->first();

                    if (!$foodPackage) {
                        abort(422, 'The selected food package is unavailable.');
                    }

                    if ($pax < 1) {
                        abort(422, 'Please provide the number of guests.');
                    }

                    $minPax = (int) ($pricing['minPax'] ?? 75);
                    $underMinFlat = (float) ($pricing['underMinFlat'] ?? 15000);
                    $foodRate = (float) $foodPackage->rate_per_guest;

                    if ($type === 'food') {
                        $foodTotal = $pax >= $minPax
                            ? $pax * $foodRate
                            : $underMinFlat;

                        $addLine(
                            $foodPackage->name,
                            'food_package',
                            $foodRate,
                            $pax,
                            $foodTotal,
                            [
                                'level' => $level,
                                'rate_per_guest' => $foodRate,
                                'minimum_guests' => $minPax,
                            ],
                            'food_package',
                            (int) $foodPackage->id,
                            $foodPackage->code
                        );
                    } else {
                        $baseFood = DB::table('food_packages')
                            ->where('level', 1)
                            ->where('is_active', true)
                            ->first();

                        if ($baseFood && $foodRate > (float) $baseFood->rate_per_guest) {
                            $upgradeRate = $foodRate - (float) $baseFood->rate_per_guest;

                            $addLine(
                                $foodPackage->name . ' Upgrade',
                                'food_upgrade',
                                $upgradeRate,
                                $pax,
                                $upgradeRate * $pax,
                                ['level' => $level],
                                'food_package',
                                (int) $foodPackage->id,
                                $foodPackage->code
                            );
                        }
                    }
                }

// Validate selected dishes before creating the booking.
$selectedDishes = $request->input('dishes', []);

foreach ($selectedDishes as $dishName) {
    $dishExists = DB::table('dishes')
        ->where('is_active', true)
        ->where(function ($query) use ($dishName) {
            $query->where('name', $dishName)
                ->orWhere('code', $dishName);
        })
        ->exists();

    if (!$dishExists) {
        abort(422, 'One of the selected dishes is unavailable: ' . $dishName);
    }
}
                // EXTRA DISHES
                $extraRates = $pricing['extraDishPer100'] ?? [];

                foreach ($request->input('extraDishes', []) as $extra) {
                    $name = is_array($extra) ? ($extra['name'] ?? '') : (string) $extra;
                    $category = is_array($extra)
                        ? strtolower($extra['category'] ?? 'chicken')
                        : 'chicken';

                    if ($name === '') {
                        continue;
                    }

                    if (in_array($category, ['drinks', 'desserts', 'rice'], true)) {
                        continue;
                    }

                    $ratePer100 = (float) ($extraRates[$category] ?? 3000);
                    $perHead = round($ratePer100 / 100);
                    $amount = $pax * $perHead;

                    $addLine(
                        'Extra Dish: ' . $name,
                        'extra_dish',
                        $perHead,
                        $pax,
                        $amount,
                        ['category' => $category]
                    );
                }

                // SPECIAL DISHES - price to be confirmed.
                foreach ($request->input('specialDishes', []) as $special) {
                    $name = is_array($special)
                        ? ($special['name'] ?? 'Special Dish')
                        : (string) $special;

                    $hasTbc = true;

                    $addLine(
                        'Special Dish: ' . $name,
                        'special_dish',
                        0,
                        1,
                        0,
                        ['price_status' => 'tbc']
                    );
                }

                // ADD-ONS: never trust client-submitted prices.
                $selectedAddOns = [];

                foreach ($request->input('addOns', []) as $selected) {
                    $code = is_array($selected)
                        ? ($selected['id'] ?? '')
                        : (string) $selected;

                    $quantity = is_array($selected)
                        ? max(1, (int) ($selected['quantity'] ?? 1))
                        : 1;

                    if ($code === '') {
                        continue;
                    }

                    $addon = DB::table('add_ons')
                        ->where('code', $code)
                        ->where('is_active', true)
                        ->first();

                    if (!$addon) {
                        abort(422, 'One of the selected add-ons is unavailable.');
                    }

                    $unitPrice = (float) ($addon->unit_price ?? 0);

                    if ($addon->price_type === 'per_head') {
                        $lineQuantity = $pax;
                        $amount = $unitPrice * $pax;
                    } else {
                        $lineQuantity = $quantity;
                        $amount = $unitPrice * $quantity;
                    }

                    if ($addon->unit_price === null) {
                        $hasTbc = true;
                    }

                    if ($addon->price_status === 'estimate') {
                        $hasEstimate = true;
                    }

                    $selectedAddOns[] = [
                        'addon' => $addon,
                        'quantity' => $lineQuantity,
                        'unit_price' => $unitPrice,
                        'amount' => $amount,
                    ];

                    $addLine(
                        $addon->label,
                        'add_on',
                        $unitPrice,
                        $lineQuantity,
                        $amount,
                        [
                            'price_type' => $addon->price_type,
                            'price_status' => $addon->price_status,
                        ],
                        'add_on',
                        (int) $addon->id,
                        $addon->code
                    );
                }

                // TRAYS: price comes from the tray category.
                $selectedTrays = [];

                foreach ($request->input('trays', []) as $selected) {
                    $code = is_array($selected)
                        ? ($selected['id'] ?? '')
                        : (string) $selected;

                    $quantity = is_array($selected)
                        ? max(1, (int) ($selected['qty'] ?? $selected['quantity'] ?? 1))
                        : 1;

                    if ($code === '') {
                        continue;
                    }

                    $tray = DB::table('trays')
                        ->join('tray_categories', 'trays.tray_category_id', '=', 'tray_categories.id')
                        ->where('trays.code', $code)
                        ->where('trays.is_active', true)
                        ->where('tray_categories.is_active', true)
                        ->select(
                            'trays.id',
                            'trays.code',
                            'trays.name',
                            'tray_categories.name as category_name',
                            'tray_categories.price_per_tray'
                        )
                        ->first();

                    if (!$tray) {
                        abort(422, 'One of the selected trays is unavailable.');
                    }

                    $unitPrice = (float) $tray->price_per_tray;
                    $amount = $unitPrice * $quantity;

                    $selectedTrays[] = [
                        'tray' => $tray,
                        'quantity' => $quantity,
                        'unit_price' => $unitPrice,
                        'amount' => $amount,
                    ];

                    $addLine(
                        $tray->name,
                        'tray',
                        $unitPrice,
                        $quantity,
                        $amount,
                        ['category' => $tray->category_name],
                        'tray',
                        (int) $tray->id,
                        $tray->code
                    );
                }

                if ($type === 'trays' && count($selectedTrays) === 0) {
                    abort(422, 'Please select at least one tray.');
                }

                $total = (int) round($subtotal);
                $downpaymentPercent = $type === 'trays'
                    ? 100
                    : (float) ($pricing['downpaymentPercent'] ?? 50);
                $downpayment = (int) round($total * $downpaymentPercent / 100);

                if ($isManualPreview) {
                    return [
                        'preview' => [
                            'subtotal' => $total,
                            'discount' => 0,
                            'total' => $total,
                            'paymentAmount' => $downpayment,
                            'paymentPercent' => $downpaymentPercent,
                            'paymentLabel' => $type === 'trays' ? 'Full payment' : 'Required downpayment',
                            'lines' => array_map(fn (array $line) => [
                                'name' => $line['name'],
                                'quantity' => $line['quantity'],
                                'unitPrice' => $line['unit_price'],
                                'total' => $line['amount'],
                            ], $lines),
                        ],
                    ];
                }

                // Create a unique booking reference.
                $reference = null;

                for ($attempt = 0; $attempt < 5; $attempt++) {
                    $candidate = 'TK-' . now()->format('ymd') . '-' . strtoupper(Str::random(3));

                    if (!DB::table('bookings')->where('reference', $candidate)->exists()) {
                        $reference = $candidate;
                        break;
                    }
                }

                if (!$reference) {
                    throw new \RuntimeException('Unable to generate a booking reference.');
                }

                $status = $type === 'trays'
                    ? 'Pending Verification'
                    : 'Hold (48 Hours)';

                $details = [
                    'contactMethod' => $request->input('contactMethod'),
                    'messengerName' => $request->input('messengerName'),
                    'eventTime' => $request->input('eventTime'),
                    'stageText' => $request->input('stageText'),
                    'skipped' => $request->input('skipped', []),
                    'layoutThumbnail' => $request->input('layoutThumbnail'),
                    'floorPlan' => $request->input('floorPlan'),
                    'estimate' => $hasEstimate,
                    'tbc' => $hasTbc,
                    'downpayment_percent' => $downpaymentPercent,
                    'lines' => $lines,
                ];

                $bookingId = DB::table('bookings')->insertGetId([
                    'reference' => $reference,
                    'booking_type' => $type,
                    'status' => $status,
                    'customer_name' => $validated['customerName'],
                    'customer_mobile' => $validated['mobile'],
                    'event_date' => $date,
                    'occasion' => $request->input('packageId'),
                    'guest_count' => $type === 'trays' ? null : ($pax ?: null),
                    'preferred_start_time' => $this->toTime($request->input('eventTime')),
                    'venue_type' => $request->input('venue'),
                    'venue_address' => $request->input('venue'),
                    'customer_notes' => $request->input('notes'),
                    'fulfillment_type' => $request->input('fulfillment'),
                    'delivery_notes' => $request->input('deliveryNotes'),
                    'subtotal' => $total,
                    'discount' => 0,
                    'total_amount' => $total,
                    'downpayment_amount' => $downpayment,
                    'amount_paid' => 0,
                    'balance_amount' => $total,
                    'pricing_snapshot' => json_encode($details),
                    'hold_expires_at' => $activeHold?->expires_at,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // Save booking item lines.
                foreach ($lines as $line) {
                    DB::table('booking_items')->insert([
                        'booking_id' => $bookingId,
                        'item_type' => $line['item_type'],
                        'catalog_type' => $line['catalog_type'],
                        'catalog_id' => $line['catalog_id'],
                        'item_code' => $line['code'],
                        'item_name' => $line['name'],
                        'quantity' => $line['quantity'],
                        'unit_price' => $line['unit_price'],
                        'line_total' => $line['amount'],
                        'details' => json_encode($line['details']),
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                // Save selected dishes.
                foreach ($selectedDishes as $dishName) {
                    $dish = DB::table('dishes')
                        ->where('is_active', true)
                        ->where(function ($query) use ($dishName) {
                            $query->where('name', $dishName)
                                ->orWhere('code', $dishName);
                        })
                        ->first();

                    $category = DB::table('dish_categories')
                        ->where('id', $dish->dish_category_id)
                        ->value('name');

                    DB::table('booking_menu_picks')->insert([
                        'booking_id' => $bookingId,
                        'dish_id' => $dish->id,
                        'dish_name' => $dish->name,
                        'category_name' => $category,
                        'selection_group' => 'selected',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                // Save add-on details.
                foreach ($selectedAddOns as $selected) {
                    $addon = $selected['addon'];

                    DB::table('booking_add_ons')->insert([
                        'booking_id' => $bookingId,
                        'add_on_id' => $addon->id,
                        'add_on_name' => $addon->label,
                        'quantity' => $selected['quantity'],
                        'price_type' => $addon->price_type,
                        'unit_price' => $selected['unit_price'],
                        'line_total' => (int) round($selected['amount']),
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                // Save layout if customer submitted one.
                $layout = $request->input('layout');

                if (is_array($layout) && !empty($layout)) {
                    DB::table('booking_layouts')->insert([
                        'booking_id' => $bookingId,
                        'layout_name' => $request->input('layoutId'),
                        'layout_data' => json_encode($layout),
                        'notes' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                // Convert the temporary date hold into a permanent booking lock.
                if ($activeHold) {
                    $activeHold->update([
                        'status' => 'converted',
                        'booking_id' => $bookingId,
                    ]);

                    DateLock::whereDate('event_date', $date)
                        ->where('hold_id', $activeHold->id)
                        ->update([
                            'lock_type' => 'booking',
                            'booking_id' => $bookingId,
                            'expires_at' => null,
                        ]);
                }

                return [
                    'id' => $bookingId,
                    'ref' => $reference,
                    'customerName' => $validated['customerName'],
                    'mobile' => $validated['mobile'],
                    'contactMethod' => $request->input('contactMethod'),
                    'messengerName' => $request->input('messengerName'),
                    'customer' => [
                        'name' => $validated['customerName'],
                        'mobile' => $validated['mobile'],
                    ],
                    'eventDate' => $date,
                    'deliveryDate' => $date,
                    'deliveryTime' => $request->input('eventTime'),
                    'timeSlot' => $request->input('eventTime'),
                    'eventType' => $package->name ?? ucfirst($type),
                    'type' => $type,
                    'typeBadge' => ucfirst($type),
                    'tag' => ucfirst($type),
                    'packageId' => $request->input('packageId'),
                    'packageName' => $package->name ?? ($type === 'food' ? 'Food Package ' . $request->input('level') : ucfirst($type)),
                    'level' => $request->input('level'),
                    'pax' => $pax,
                    'items' => $lines,
                    'dishes' => $selectedDishes,
                    'extraDishes' => $request->input('extraDishes', []),
                    'specialDishes' => $request->input('specialDishes', []),
                    'addOns' => $request->input('addOns', []),
                    'trays' => $request->input('trays', []),
                    'subtotal' => $total,
                    'total' => $total,
                    'paid' => 0,
                    'balance' => $total,
                    'downpaymentRequired' => $downpayment,
                    'status' => $status,
                    'paymentStatus' => 'Unpaid',
                    'turnoverStatus' => 'Pending',
                    'notes' => $request->input('notes'),
                    'createdDate' => $now->toDateTimeString(),
                    'dueDate' => $activeHold?->expires_at?->toDateTimeString(),
                    'quoteDetails' => $details,
                ];
            });

            return response()->json([
                'success' => true,
                'booking' => $booking,
            ], $isManualPreview ? 200 : 201);

        } catch (QueryException $e) {
            report($e);

            return response()->json([
                'message' => 'The booking could not be saved because of a database conflict. Please try again.',
            ], 409);
        }
    }

    private function toTime($value): ?string
    {
        if (!$value) {
            return null;
        }

        $timestamp = strtotime((string) $value);

        return $timestamp ? date('H:i:s', $timestamp) : null;
    }

    /**
     * Create or refresh a customer's 48-hour date hold.
     */
    public function storeHold(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'session_token' => ['required', 'string', 'min:32', 'max:100'],
        ]);

        $date = $validated['date'];
        $token = $validated['session_token'];

        try {
            $hold = DB::transaction(function () use ($date, $token) {
                $now = now();

                $lock = DateLock::where('event_date', $date)
                    ->lockForUpdate()
                    ->first();

                if ($lock && $lock->lock_type === 'hold') {
                    $existingHold = Hold::find($lock->hold_id);

                    if (!$existingHold || $existingHold->expires_at->lte($now)) {
                        if ($existingHold) {
                            $existingHold->update([
                                'status' => 'expired',
                                'released_at' => $now,
                            ]);
                        }

                        $lock->delete();
                        $lock = null;
                    }
                }

                if ($lock && $lock->lock_type === 'booking') {
                    return null;
                }

                if ($lock && $lock->lock_type === 'hold') {
                    $existingHold = Hold::find($lock->hold_id);

                    if (!$existingHold || $existingHold->session_token !== $token) {
                        return null;
                    }
                }

                $previousHolds = Hold::where('session_token', $token)
                    ->where('status', 'active')
                    ->whereDate('event_date', '!=', $date)
                    ->get();

                foreach ($previousHolds as $previousHold) {
                    DateLock::where('hold_id', $previousHold->id)
                        ->where('lock_type', 'hold')
                        ->delete();

                    $previousHold->update([
                        'status' => 'released',
                        'released_at' => $now,
                    ]);
                }

                $expiresAt = $now->copy()->addHours(48);

                if ($lock && $lock->lock_type === 'hold') {
                    $hold = Hold::findOrFail($lock->hold_id);

                    $hold->update([
                        'expires_at' => $expiresAt,
                        'status' => 'active',
                        'released_at' => null,
                    ]);

                    $lock->update([
                        'expires_at' => $expiresAt,
                    ]);

                    return $hold->fresh();
                }

                $hold = Hold::create([
                    'session_token' => $token,
                    'event_date' => $date,
                    'status' => 'active',
                    'expires_at' => $expiresAt,
                ]);

                DateLock::create([
                    'event_date' => $date,
                    'lock_type' => 'hold',
                    'hold_id' => $hold->id,
                    'expires_at' => $expiresAt,
                ]);

                return $hold;
            });

            if (!$hold) {
                return response()->json([
                    'message' => 'This date is no longer available. Please select another date.',
                ], 409);
            }

            return response()->json([
                'success' => true,
                'hold' => [
                    'date' => $hold->event_date->format('Y-m-d'),
                    'expiresAt' => $hold->expires_at->toIso8601String(),
                ],
            ]);
        } catch (QueryException $e) {
            return response()->json([
                'message' => 'This date was just reserved by another customer. Please select another date.',
            ], 409);
        }
    }

    public function activeHold(Request $request)
    {
        $validated = $request->validate([
            'session_token' => ['required', 'string', 'min:32', 'max:100'],
        ]);

        $hold = Hold::where('session_token', $validated['session_token'])
            ->where('status', 'active')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (!$hold) {
            return response()->json(['hold' => null]);
        }

        return response()->json([
            'hold' => [
                'date' => $hold->event_date->format('Y-m-d'),
                'expiresAt' => $hold->expires_at->toIso8601String(),
            ],
        ]);
    }

    public function releaseHold(Request $request)
    {
        $validated = $request->validate([
            'session_token' => ['required', 'string', 'min:32', 'max:100'],
        ]);

        DB::transaction(function () use ($validated) {
            $holds = Hold::where('session_token', $validated['session_token'])
                ->where('status', 'active')
                ->get();

            foreach ($holds as $hold) {
                DateLock::where('hold_id', $hold->id)
                    ->where('lock_type', 'hold')
                    ->delete();

                $hold->update([
                    'status' => 'released',
                    'released_at' => now(),
                ]);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Date hold released.',
        ]);
    }
}
