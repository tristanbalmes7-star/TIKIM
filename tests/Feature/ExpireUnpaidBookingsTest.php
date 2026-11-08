<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DateLock;
use App\Models\Hold;
use App\Models\Payment;
use App\Models\PaymentLog;
use App\Models\PaymentReceipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ExpireUnpaidBookingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_expired_unpaid_event_booking_expires_and_releases_its_lock(): void
    {
        $booking = $this->booking('event', now()->subSecond());
        $lock = $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
        $this->assertDatabaseMissing('date_locks', ['id' => $lock->id]);
    }

    public function test_expired_unpaid_food_booking_expires(): void
    {
        $booking = $this->booking('food', now()->subSecond());
        $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
    }

    public function test_food_trays_booking_is_never_expired(): void
    {
        $booking = $this->booking('trays', now()->subDay(), 'Pending Verification');
        $lock = $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Pending Verification']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_booking_before_its_deadline_is_not_expired(): void
    {
        $booking = $this->booking('event', now()->addMinute());
        $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Hold (48 Hours)']);
    }

    public function test_booking_without_a_hold_deadline_is_not_expired(): void
    {
        $booking = $this->booking('event', null);
        $lock = $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Hold (48 Hours)',
            'hold_expires_at' => null,
        ]);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_booking_expires_when_deadline_equals_current_time(): void
    {
        $deadline = now()->startOfSecond();
        $booking = $this->booking('event', $deadline);
        $lock = $this->bookingLock($booking);

        $this->travelTo($deadline);
        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
        $this->assertDatabaseMissing('date_locks', ['id' => $lock->id]);
    }

    public function test_confirmed_booking_is_not_expired(): void
    {
        $booking = $this->booking('event', now()->subDay(), 'Confirmed');
        $lock = $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Confirmed']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_multiple_approved_payments_are_summed_toward_downpayment(): void
    {
        $booking = $this->booking('event', now()->subDay());
        $lock = $this->bookingLock($booking);
        $this->payment($booking, 'Approved', 300, now()->subDays(2));
        $this->payment($booking, 'Approved', 200, now()->subDays(2)->addMinute());

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Hold (48 Hours)']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_fully_paid_booking_is_not_expired(): void
    {
        $booking = $this->booking('food', now()->subDay(), 'Fully Paid');
        $lock = $this->bookingLock($booking);

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Fully Paid']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_sufficient_approved_downpayment_protects_booking(): void
    {
        $booking = $this->booking('event', now()->subDay());
        $lock = $this->bookingLock($booking);
        $this->payment($booking, 'Approved', 500, now()->subDays(2));

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Hold (48 Hours)']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
    }

    public function test_timely_pending_payment_protects_booking_after_deadline(): void
    {
        $deadline = now()->subHour();
        $booking = $this->booking('event', $deadline);
        $lock = $this->bookingLock($booking);
        $this->payment($booking, 'Pending Verification', 500, $deadline->copy()->subMinute());
        $this->payment($booking, 'Pending Verification', 100, $deadline->copy()->addMinute());

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Hold (48 Hours)']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
        $this->assertSame($deadline->toDateTimeString(), $booking->fresh()->hold_expires_at->toDateTimeString());
    }

    public function test_rejected_timely_payment_after_deadline_allows_expiration(): void
    {
        $deadline = now()->subHour();
        $booking = $this->booking('event', $deadline);
        $this->bookingLock($booking);
        $this->payment($booking, 'Rejected', 500, $deadline->copy()->subMinute());

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
    }

    public function test_timely_payment_rejected_before_deadline_allows_expiration_after_deadline(): void
    {
        $deadline = now()->addHour()->startOfSecond();
        $booking = $this->booking('event', $deadline);
        $this->bookingLock($booking);
        $payment = $this->payment($booking, 'Pending Verification', 500, now());

        $this->travelTo($deadline->copy()->subMinute());
        $payment->update(['status' => 'Rejected']);

        $this->travelTo($deadline);
        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'Rejected']);
    }

    public function test_pending_payment_submitted_after_deadline_does_not_protect_booking(): void
    {
        $deadline = now()->subHour();
        $booking = $this->booking('food', $deadline);
        $this->bookingLock($booking);
        $this->payment($booking, 'Pending Verification', 500, $deadline->copy()->addSecond());

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
    }

    public function test_rejected_payment_does_not_count_toward_approved_downpayment(): void
    {
        $booking = $this->booking('event', now()->subDay());
        $this->bookingLock($booking);
        $this->payment($booking, 'Rejected', 500, now()->subDays(2));

        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
    }

    public function test_only_the_matching_booking_lock_is_released_and_active_holds_remain(): void
    {
        $expired = $this->booking('event', now()->subDay());
        $expiredLock = $this->bookingLock($expired);

        $otherBooking = $this->booking('food', now()->subMinute(), 'Confirmed');
        $otherLock = $this->bookingLock($otherBooking);

        $activeHold = Hold::create([
            'session_token' => Str::random(40),
            'event_date' => now()->addDays(3)->toDateString(),
            'status' => 'active',
            'expires_at' => now()->addHour(),
        ]);
        $holdLock = DateLock::create([
            'event_date' => $activeHold->event_date,
            'lock_type' => 'hold',
            'hold_id' => $activeHold->id,
            'expires_at' => $activeHold->expires_at,
        ]);

        $this->runExpiration();

        $this->assertDatabaseMissing('date_locks', ['id' => $expiredLock->id]);
        $this->assertDatabaseHas('date_locks', ['id' => $otherLock->id, 'booking_id' => $otherBooking->id]);
        $this->assertDatabaseHas('date_locks', ['id' => $holdLock->id, 'hold_id' => $activeHold->id]);
        $this->assertDatabaseHas('holds', ['id' => $activeHold->id, 'status' => 'active']);
    }

    public function test_availability_does_not_block_an_expired_booking_date(): void
    {
        $booking = $this->booking('event', now()->subDay());
        $this->bookingLock($booking);
        $this->runExpiration();

        $date = $booking->event_date->toDateString();
        $this->getJson("/api/v1/availability?from={$date}&to={$date}")
            ->assertOk()
            ->assertJsonMissingPath("availability.{$date}");
    }

    public function test_running_expiration_repeatedly_preserves_booking_and_payment_history(): void
    {
        $booking = $this->booking('event', now()->subDay());
        $this->bookingLock($booking);
        $payment = $this->payment($booking, 'Rejected', 100, now()->subDays(2));
        $receipt = PaymentReceipt::create([
            'payment_id' => $payment->id,
            'original_filename' => 'history.pdf',
            'stored_filename' => 'history.pdf',
            'storage_path' => 'payment-receipts/history.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'sha256_hash' => hash('sha256', 'history-receipt'),
        ]);
        $paymentLog = PaymentLog::create([
            'payment_id' => $payment->id,
            'action' => 'Rejected',
            'previous_status' => 'Pending Verification',
            'new_status' => 'Rejected',
            'remarks' => 'Test history record.',
        ]);

        $this->runExpiration();
        $this->runExpiration();

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Expired']);
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'Rejected']);
        $this->assertDatabaseHas('payment_receipts', ['id' => $receipt->id, 'payment_id' => $payment->id]);
        $this->assertDatabaseHas('payment_logs', ['id' => $paymentLog->id, 'payment_id' => $payment->id]);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('payment_logs', 1);
    }

    public function test_timely_pending_payment_can_be_approved_after_deadline(): void
    {
        $deadline = now()->subHour();
        $booking = $this->booking('event', $deadline);
        $payment = $this->payment($booking, 'Pending Verification', 500, $deadline->copy()->subMinute());
        PaymentReceipt::create([
            'payment_id' => $payment->id,
            'original_filename' => 'receipt.pdf',
            'stored_filename' => 'receipt.pdf',
            'storage_path' => 'payment-receipts/receipt.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'sha256_hash' => hash('sha256', 'timely-payment-receipt'),
        ]);
        $organizer = User::factory()->create([
            'username' => 'expiration-organizer',
            'role' => 'Event Coordinator',
        ]);

        $this->runExpiration();

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/approve")
            ->assertOk()
            ->assertJsonPath('payment.status', 'Approved')
            ->assertJsonPath('booking.status', 'Confirmed');
    }

    public function test_payment_for_an_expired_booking_cannot_be_approved(): void
    {
        $booking = $this->booking('event', now()->subHour(), 'Expired');
        $payment = $this->payment($booking, 'Pending Verification', 500, now()->subHours(2));
        PaymentReceipt::create([
            'payment_id' => $payment->id,
            'original_filename' => 'receipt.pdf',
            'stored_filename' => 'receipt.pdf',
            'storage_path' => 'payment-receipts/expired-receipt.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'sha256_hash' => hash('sha256', 'expired-payment-receipt'),
        ]);
        $organizer = User::factory()->create([
            'username' => 'expired-booking-organizer',
            'role' => 'Event Coordinator',
        ]);

        $this->actingAs($organizer)
            ->postJson("/api/v1/admin/payments/{$payment->id}/approve")
            ->assertConflict();

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'status' => 'Pending Verification',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Expired',
            'amount_paid' => 0,
        ]);
        $this->assertDatabaseCount('payment_logs', 0);
    }

    public function test_payment_submission_after_deadline_is_rejected(): void
    {
        Storage::fake('local');
        $booking = $this->booking('event', now()->subSecond());

        $this->withSession([
            'tikim.verified_booking_id' => $booking->id,
        ])->post(
            "/api/v1/bookings/{$booking->reference}/payments",
            [
                'payment_method' => 'GCash',
                'transaction_number' => 'LATE-12345',
                'amount' => 500,
                'receipt' => UploadedFile::fake()->createWithContent('receipt.pdf', '%PDF-1.4 test'),
            ],
            ['Accept' => 'application/json']
        )->assertConflict();

        $this->assertDatabaseCount('payments', 0);
    }

    private function runExpiration(): void
    {
        $this->artisan('bookings:expire-unpaid')->assertSuccessful();
    }

    private function booking(
        string $type,
        ?\Illuminate\Support\Carbon $deadline,
        string $status = 'Hold (48 Hours)'
    ): Booking {
        static $sequence = 0;
        $sequence++;
        $eventDate = now()->addDays($sequence + 1)->toDateString();

        return Booking::create([
            'reference' => 'TK-TEST-' . Str::upper(Str::random(8)),
            'booking_type' => $type,
            'status' => $status,
            'customer_name' => 'Expiration Test',
            'customer_mobile' => '09171234567',
            'event_date' => $eventDate,
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 0,
            'balance_amount' => 1000,
            'hold_expires_at' => $deadline,
        ]);
    }

    private function bookingLock(Booking $booking): DateLock
    {
        return DateLock::create([
            'event_date' => $booking->event_date,
            'lock_type' => 'booking',
            'booking_id' => $booking->id,
        ]);
    }

    private function payment(
        Booking $booking,
        string $status,
        int $amount,
        \Illuminate\Support\Carbon $submittedAt
    ): Payment {
        return $booking->payments()->create([
            'reference' => 'PAY-' . Str::upper((string) Str::uuid()),
            'payment_type' => 'Downpayment',
            'payment_method' => 'GCash',
            'amount' => $amount,
            'status' => $status,
            'transaction_number' => 'TX-' . Str::upper(Str::random(12)),
            'submitted_at' => $submittedAt,
        ]);
    }
}
