<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Payment;
use App\Models\PaymentReceipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PaymentWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_customer_can_submit_a_private_receipt(): void
    {
        Storage::fake('local');
        $booking = $this->booking(
            'TK-261108-ABC',
            'event',
            146960,
            73480
        );

        $response = $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => '12232434',
                'amount' => 73480,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertCreated()
            ->assertJsonPath('payment.status', 'Pending Verification');

        $payment = Payment::with('receipts')->firstOrFail();
        $this->assertSame(73480, $payment->amount);
        $this->assertSame('12232434', $payment->transaction_number);
        $this->assertNotNull($payment->submitted_at);
        $this->assertCount(1, $payment->receipts);
        Storage::disk('local')->assertExists($payment->receipts->first()->storage_path);
        $this->assertDatabaseHas('payment_logs', [
            'payment_id' => $payment->id,
            'action' => 'Submitted',
            'new_status' => 'Pending Verification',
        ]);

        $this->postJson('/api/v1/bookings/lookup', [
            'reference' => $booking->reference,
            'last4' => '4567',
        ])->assertOk()
            ->assertJsonPath('booking.payments.0.amount', 73480);
    }

    public function test_customer_payment_submission_requires_transaction_number(): void
    {
        $booking = $this->booking();

        $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'amount' => 500,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        )->assertUnprocessable()
            ->assertJsonValidationErrors('transaction_number');

        $this->assertDatabaseCount('payments', 0);
    }

    public function test_customer_cannot_submit_an_invalid_file(): void
    {
        $booking = $this->booking();

        $response = $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10002',
                'amount' => 500,
                'receipt' => UploadedFile::fake()->create('receipt.txt', 10, 'text/plain'),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertUnprocessable();
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_booking_lookup_succeeds_when_there_are_no_payment_submissions(): void
    {
        $booking = $this->booking();

        $this->postJson('/api/v1/bookings/lookup', [
            'reference' => $booking->reference,
            'last4' => '4567',
        ])->assertOk()
            ->assertJsonPath('booking.ref', $booking->reference)
            ->assertJsonPath('booking.status', 'Hold (48 Hours)')
            ->assertJsonPath('booking.paidAmount', 0)
            ->assertJsonPath('booking.balance', 1000)
            ->assertJsonPath('booking.payments', []);
    }

    public function test_booking_lookup_reports_a_pending_payment_submission(): void
    {
        $booking = $this->booking();
        $this->pendingPayment($booking, 500);

        $this->postJson('/api/v1/bookings/lookup', [
            'reference' => $booking->reference,
            'last4' => '4567',
        ])->assertOk()
            ->assertJsonPath('booking.ref', $booking->reference)
            ->assertJsonPath('booking.status', 'Pending Verification')
            ->assertJsonPath('booking.paidAmount', 0)
            ->assertJsonPath('booking.balance', 1000)
            ->assertJsonPath('booking.payments.0.status', 'Pending Verification')
            ->assertJsonPath('booking.payments.0.amount', 500);
    }

    public function test_only_one_unreviewed_payment_can_be_submitted_for_a_booking(): void
    {
        Storage::fake('local');
        $booking = $this->booking();
        $session = ['tikim.verified_booking_id' => $booking->id];
        $this->withSession($session)->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10007',
                'amount' => 500,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        )->assertCreated();

        $this->withSession($session)->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'Maya',
                'transaction_number' => 'MY-10007',
                'amount' => 500,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        )->assertConflict();

        $this->assertDatabaseCount('payments', 1);
    }

    public function test_event_payment_must_cover_the_remaining_downpayment(): void
    {
        $booking = $this->booking();

        $response = $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10005',
                'amount' => 400,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertUnprocessable();
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_food_trays_payment_must_cover_the_full_balance(): void
    {
        $booking = $this->booking('TK-261108-TRY', 'trays');

        $response = $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10006',
                'amount' => 500,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertUnprocessable();
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_customer_session_cannot_submit_for_another_booking(): void
    {
        $verifiedBooking = $this->booking();
        $otherBooking = $this->booking('TK-261108-XYZ');

        $response = $this->withSession([
            'tikim.verified_booking_id' => $verifiedBooking->id,
        ])->post(
            "/api/v1/bookings/{$otherBooking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10003',
                'amount' => 500,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertNotFound();
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_only_event_coordinators_can_view_the_payment_queue(): void
    {
        $this->getJson('/api/v1/admin/payments/pending')
            ->assertUnauthorized();

        $unauthorizedUser = User::factory()->create([
            'username' => 'viewer',
            'role' => 'Viewer',
        ]);

        $this->actingAs($unauthorizedUser)
            ->getJson('/api/v1/admin/payments/pending')
            ->assertForbidden();
    }

    public function test_approval_updates_payment_booking_balance_and_audit_log(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking();
        $payment = $this->pendingPayment($booking, 600);

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/approve")
            ->assertOk()
            ->assertJsonPath('payment.status', 'Approved')
            ->assertJsonPath('booking.amountPaid', 600)
            ->assertJsonPath('booking.balance', 400)
            ->assertJsonPath('booking.status', 'Confirmed');

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'status' => 'Approved',
            'reviewed_by' => $organizer->id,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'amount_paid' => 600,
            'balance_amount' => 400,
            'status' => 'Confirmed',
        ]);
        $this->assertDatabaseHas('payment_logs', [
            'payment_id' => $payment->id,
            'performed_by' => $organizer->id,
            'action' => 'Approved',
            'previous_status' => 'Pending Verification',
            'new_status' => 'Approved',
        ]);
    }

    public function test_approval_rejects_an_amount_that_exceeds_the_database_balance(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking();
        $booking->update([
            'amount_paid' => 800,
            'balance_amount' => 1,
        ]);
        $payment = $this->pendingPayment($booking, 250);

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/approve")
            ->assertConflict();

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'status' => 'Pending Verification',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'balance_amount' => 1,
            'amount_paid' => 800,
        ]);
    }

    public function test_rejection_records_the_reason_without_changing_booking_balance(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking();
        $payment = $this->pendingPayment($booking, 500);

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/reject", [
                'reason' => 'Transaction reference could not be verified.',
            ])
            ->assertOk()
            ->assertJsonPath('payment.status', 'Rejected');

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'status' => 'Rejected',
            'admin_remarks' => 'Transaction reference could not be verified.',
            'reviewed_by' => $organizer->id,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'amount_paid' => 0,
            'balance_amount' => 1000,
        ]);
        $this->assertDatabaseHas('payment_logs', [
            'payment_id' => $payment->id,
            'action' => 'Rejected',
            'new_status' => 'Rejected',
            'remarks' => 'Transaction reference could not be verified.',
        ]);
    }

    public function test_reviewing_a_payment_twice_is_rejected(): void
    {
        $organizer = $this->organizer();
        $payment = $this->pendingPayment($this->booking(), 500);

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/approve")
            ->assertOk();

        $this->postJson("/api/v1/admin/payments/{$payment->id}/reject", [
            'reason' => 'Duplicate decision',
        ])->assertConflict();

        $this->assertDatabaseCount('payment_logs', 1);
    }

    public function test_booking_payment_submission_cannot_exceed_its_current_balance(): void
    {
        $booking = $this->booking();
        $booking->update(['amount_paid' => 800]);

        $response = $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'GC-10004',
                'amount' => 250,
                'receipt' => $this->validReceipt(),
            ],
            ['Accept' => 'application/json']
        );

        $response->assertUnprocessable();
        $this->assertDatabaseCount('payments', 0);
    }

    private function organizer(): User
    {
        return User::factory()->create([
            'username' => 'organizer',
            'role' => 'Event Coordinator',
        ]);
    }

    private function booking(
        string $reference = 'TK-261108-ABC',
        string $type = 'event',
        int $total = 1000,
        int $downpayment = 500
    ): Booking
    {
        return Booking::create([
            'reference' => $reference,
            'booking_type' => $type,
            'status' => $type === 'trays' ? 'Pending Verification' : 'Hold (48 Hours)',
            'customer_name' => 'Test Customer',
            'customer_mobile' => '09171234567',
            'event_date' => now()->addWeek()->toDateString(),
            'total_amount' => $total,
            'downpayment_amount' => $downpayment,
            'amount_paid' => 0,
            'balance_amount' => $total,
        ]);
    }

    private function pendingPayment(Booking $booking, int $amount): Payment
    {
        $payment = $booking->payments()->create([
            'reference' => 'PAY-' . strtoupper((string) \Illuminate\Support\Str::uuid()),
            'payment_type' => 'Downpayment',
            'payment_method' => 'GCash',
            'amount' => $amount,
            'status' => 'Pending Verification',
            'transaction_number' => 'GC-' . $amount . '-' . $booking->id,
            'submitted_at' => now(),
        ]);

        $payment->receipts()->create([
            'original_filename' => 'receipt.pdf',
            'stored_filename' => 'receipt.pdf',
            'storage_path' => 'payment-receipts/receipt.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'sha256_hash' => hash('sha256', 'receipt-' . $booking->id),
        ]);

        return $payment;
    }

    private function validReceipt(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            'receipt.pdf',
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
        );
    }
}
