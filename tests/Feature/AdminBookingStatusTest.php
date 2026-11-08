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
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminBookingStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_update_booking_status(): void
    {
        $booking = $this->booking();

        $this->patchJson($this->statusUrl($booking), ['action' => 'cancel'])
            ->assertUnauthorized();
    }

    public function test_non_coordinator_cannot_update_booking_status(): void
    {
        $booking = $this->booking();
        $viewer = User::factory()->create([
            'username' => 'status-viewer-' . Str::lower(Str::random(8)),
            'role' => 'Viewer',
        ]);

        $this->actingAs($viewer)
            ->patchJson($this->statusUrl($booking), ['action' => 'cancel'])
            ->assertForbidden();
    }

    public function test_only_supported_administrative_actions_are_accepted(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking();

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'Expired'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('action');
    }

    public function test_cancellation_releases_only_its_lock_and_preserves_financial_and_payment_history(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking(['amount_paid' => 300, 'balance_amount' => 700]);
        $ownLock = $this->bookingLock($booking);
        $otherBooking = $this->booking([
            'event_date' => now()->addDays(3)->toDateString(),
        ]);
        $otherLock = $this->bookingLock($otherBooking);
        $approved = $this->payment($booking, 'Approved', 300);
        $rejected = $this->payment($booking, 'Rejected', 40);
        $receipt = PaymentReceipt::create([
            'payment_id' => $approved->id,
            'original_filename' => 'approved-proof.png',
            'stored_filename' => 'approved-proof.png',
            'storage_path' => 'payment-receipts/approved-proof.png',
            'mime_type' => 'image/png',
            'file_size' => 12,
            'sha256_hash' => hash('sha256', 'approved-proof'),
        ]);
        $log = PaymentLog::create([
            'payment_id' => $approved->id,
            'action' => 'Approved',
            'previous_status' => 'Pending Verification',
            'new_status' => 'Approved',
            'remarks' => 'Test approval history.',
        ]);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'cancel'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Cancelled')
            ->assertJsonPath('warning', 'Approved payment history remains recorded. No refund was processed automatically.');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Cancelled',
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 300,
            'balance_amount' => 700,
        ]);
        $this->assertDatabaseMissing('date_locks', ['id' => $ownLock->id]);
        $this->assertDatabaseHas('date_locks', ['id' => $otherLock->id]);
        $this->assertDatabaseHas('payments', ['id' => $approved->id, 'status' => 'Approved', 'amount' => 300]);
        $this->assertDatabaseHas('payments', ['id' => $rejected->id, 'status' => 'Rejected', 'amount' => 40]);
        $this->assertDatabaseHas('payment_receipts', ['id' => $receipt->id, 'payment_id' => $approved->id]);
        $this->assertDatabaseHas('payment_logs', ['id' => $log->id, 'payment_id' => $approved->id]);
    }

    public function test_cancellation_is_blocked_while_a_payment_is_pending_verification(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking();
        $lock = $this->bookingLock($booking);
        $payment = $this->payment($booking, 'Pending Verification', 500);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'cancel'])
            ->assertConflict()
            ->assertJsonPath('message', 'This booking cannot be cancelled while a payment is awaiting verification.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Hold (48 Hours)']);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'Pending Verification']);
    }

    public function test_completed_cancelled_and_expired_bookings_cannot_be_cancelled_again(): void
    {
        $organizer = $this->organizer();

        foreach (['Completed', 'Cancelled', 'Expired'] as $status) {
            $booking = $this->booking(['status' => $status]);
            $this->actingAs($organizer)
                ->patchJson($this->statusUrl($booking), ['action' => 'cancel'])
                ->assertConflict();
        }
    }

    public function test_eligible_past_booking_can_be_completed_without_changing_money_or_lock(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'status' => 'Confirmed',
            'event_date' => now()->toDateString(),
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 500,
            'balance_amount' => 500,
        ]);
        $lock = $this->bookingLock($booking);
        $payment = $this->payment($booking, 'Approved', 500);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'complete'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Completed');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Completed',
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 500,
            'balance_amount' => 500,
        ]);
        $this->assertNotNull($booking->fresh()->completed_at);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id]);
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'Approved', 'amount' => 500]);
    }

    public function test_future_booking_cannot_be_completed(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'status' => 'Confirmed',
            'event_date' => now()->addDay()->toDateString(),
        ]);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'complete'])
            ->assertConflict()
            ->assertJsonPath('message', 'A booking can only be completed on or after its event date.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Confirmed']);
    }

    public function test_cancelled_and_expired_bookings_cannot_be_completed(): void
    {
        $organizer = $this->organizer();

        foreach (['Cancelled', 'Expired'] as $status) {
            $booking = $this->booking([
                'status' => $status,
                'event_date' => now()->subDay()->toDateString(),
            ]);

            $this->actingAs($organizer)
                ->patchJson($this->statusUrl($booking), ['action' => 'complete'])
                ->assertConflict();
        }
    }

    public function test_cancelled_booking_reopens_with_a_fresh_hold_deadline_when_underpaid(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'status' => 'Expired',
            'hold_expires_at' => now()->subDays(3),
        ]);
        $this->payment($booking, 'Rejected', 500);
        $before = now();

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Hold (48 Hours)');

        $booking->refresh();
        $this->assertSame('Hold (48 Hours)', $booking->status);
        $this->assertLessThanOrEqual(
            2,
            abs($booking->hold_expires_at->timestamp - $before->copy()->addHours(48)->timestamp)
        );
        $this->assertDatabaseHas('date_locks', [
            'lock_type' => 'booking',
            'booking_id' => $booking->id,
            'hold_id' => null,
        ]);
        $this->assertSame(
            $booking->event_date->toDateString(),
            DateLock::query()->where('booking_id', $booking->id)->firstOrFail()->event_date->toDateString()
        );
    }

    public function test_reopening_uses_approved_payment_totals_without_changing_them(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking(['status' => 'Cancelled', 'amount_paid' => 500]);
        $first = $this->payment($booking, 'Approved', 300);
        $second = $this->payment($booking, 'Approved', 200);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Confirmed');

        $this->assertSame(500, (int) $booking->fresh()->amount_paid);
        $this->assertDatabaseHas('payments', ['id' => $first->id, 'status' => 'Approved', 'amount' => 300]);
        $this->assertDatabaseHas('payments', ['id' => $second->id, 'status' => 'Approved', 'amount' => 200]);
        $this->assertDatabaseHas('date_locks', [
            'booking_id' => $booking->id,
            'lock_type' => 'booking',
        ]);
    }

    public function test_fully_paid_cancelled_booking_reopens_as_fully_paid(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'status' => 'Cancelled',
            'amount_paid' => 1000,
            'balance_amount' => 0,
        ]);
        $payment = $this->payment($booking, 'Approved', 1000);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Fully Paid');

        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'Approved', 'amount' => 1000]);
    }

    public function test_active_booking_on_the_date_prevents_reopening(): void
    {
        $organizer = $this->organizer();
        $date = now()->addDays(5)->toDateString();
        $booking = $this->booking(['status' => 'Cancelled', 'event_date' => $date]);
        $otherBooking = $this->booking(['event_date' => $date]);
        $this->bookingLock($otherBooking);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'Another active booking already occupies this date.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Cancelled']);
    }

    public function test_active_temporary_hold_prevents_reopening(): void
    {
        $organizer = $this->organizer();
        $date = now()->addDays(6)->toDateString();
        $booking = $this->booking(['status' => 'Cancelled', 'event_date' => $date]);
        Hold::create([
            'session_token' => Str::random(40),
            'event_date' => $date,
            'status' => 'active',
            'expires_at' => now()->addHour(),
        ]);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'An active temporary hold already occupies this date.');
    }

    public function test_foreign_date_lock_prevents_reopening(): void
    {
        $organizer = $this->organizer();
        $date = now()->addDays(7)->toDateString();
        $booking = $this->booking(['status' => 'Cancelled', 'event_date' => $date]);
        DateLock::create([
            'event_date' => $date,
            'lock_type' => 'manual',
        ]);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'A date lock already occupies this date.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Cancelled']);
    }

    public function test_food_trays_reopen_only_when_paid_and_do_not_create_a_date_lock(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'booking_type' => 'trays',
            'status' => 'Expired',
            'total_amount' => 1000,
            'downpayment_amount' => 1000,
            'amount_paid' => 1000,
            'balance_amount' => 0,
        ]);
        $approvedPayment = $this->payment($booking, 'Approved', 1000);
        $pendingPayment = $this->payment($booking, 'Pending Verification', 50);
        $rejectedPayment = $this->payment($booking, 'Rejected', 75);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertOk()
            ->assertJsonPath('booking.status', 'Fully Paid');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Fully Paid',
            'total_amount' => 1000,
            'downpayment_amount' => 1000,
            'amount_paid' => 1000,
            'balance_amount' => 0,
        ]);
        $this->assertDatabaseHas('payments', [
            'id' => $approvedPayment->id,
            'status' => 'Approved',
            'amount' => 1000,
        ]);
        $this->assertDatabaseHas('payments', [
            'id' => $pendingPayment->id,
            'status' => 'Pending Verification',
            'amount' => 50,
        ]);
        $this->assertDatabaseHas('payments', [
            'id' => $rejectedPayment->id,
            'status' => 'Rejected',
            'amount' => 75,
        ]);
        $this->assertDatabaseCount('payments', 3);
        $this->assertDatabaseCount('date_locks', 0);
    }

    public function test_food_trays_with_partial_approved_payment_cannot_be_reopened(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'booking_type' => 'trays',
            'status' => 'Cancelled',
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 500,
            'balance_amount' => 500,
        ]);
        $this->payment($booking, 'Approved', 500);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'Food Trays bookings can only be reopened when approved payments cover the full booking amount.');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Cancelled',
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 500,
            'balance_amount' => 500,
        ]);
    }

    public function test_food_trays_with_zero_approved_payments_cannot_reopen_when_downpayment_is_zero(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'booking_type' => 'trays',
            'status' => 'Expired',
            'total_amount' => 1000,
            'downpayment_amount' => 0,
            'amount_paid' => 0,
            'balance_amount' => 1000,
        ]);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'Food Trays bookings can only be reopened when approved payments cover the full booking amount.');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Expired',
            'downpayment_amount' => 0,
        ]);
    }

    public function test_pending_and_rejected_food_trays_payments_do_not_count_toward_full_payment(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking([
            'booking_type' => 'trays',
            'status' => 'Cancelled',
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 0,
            'balance_amount' => 1000,
        ]);
        $pendingPayment = $this->payment($booking, 'Pending Verification', 600);
        $rejectedPayment = $this->payment($booking, 'Rejected', 600);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict()
            ->assertJsonPath('message', 'Food Trays bookings can only be reopened when approved payments cover the full booking amount.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => 'Cancelled']);
        $this->assertDatabaseHas('payments', [
            'id' => $pendingPayment->id,
            'status' => 'Pending Verification',
            'amount' => 600,
        ]);
        $this->assertDatabaseHas('payments', [
            'id' => $rejectedPayment->id,
            'status' => 'Rejected',
            'amount' => 600,
        ]);
    }

    public function test_repeated_reopen_attempt_does_not_create_duplicate_date_locks(): void
    {
        $organizer = $this->organizer();
        $booking = $this->booking(['status' => 'Expired']);

        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertOk();
        $this->actingAs($organizer)
            ->patchJson($this->statusUrl($booking), ['action' => 'reopen'])
            ->assertConflict();

        $this->assertDatabaseCount('date_locks', 1);
        $this->assertDatabaseHas('date_locks', [
            'booking_id' => $booking->id,
            'lock_type' => 'booking',
        ]);
    }

    private function organizer(): User
    {
        return User::factory()->create([
            'username' => 'status-organizer-' . Str::lower(Str::random(8)),
            'role' => 'Event Coordinator',
        ]);
    }

    private function booking(array $overrides = []): Booking
    {
        static $sequence = 0;
        $sequence++;

        return Booking::create(array_merge([
            'reference' => 'TK-STATUS-' . Str::upper(Str::random(8)),
            'booking_type' => 'event',
            'status' => 'Hold (48 Hours)',
            'customer_name' => 'Status Test',
            'customer_mobile' => '09171234567',
            'event_date' => now()->addDays($sequence + 1)->toDateString(),
            'total_amount' => 1000,
            'downpayment_amount' => 500,
            'amount_paid' => 0,
            'balance_amount' => 1000,
        ], $overrides));
    }

    private function bookingLock(Booking $booking): DateLock
    {
        return DateLock::create([
            'event_date' => $booking->event_date,
            'lock_type' => 'booking',
            'booking_id' => $booking->id,
        ]);
    }

    private function payment(Booking $booking, string $status, int $amount): Payment
    {
        return $booking->payments()->create([
            'reference' => 'PAY-' . Str::upper((string) Str::uuid()),
            'payment_type' => 'Downpayment',
            'payment_method' => 'GCash',
            'amount' => $amount,
            'status' => $status,
            'transaction_number' => 'TX-' . Str::upper(Str::random(12)),
            'submitted_at' => Carbon::now(),
        ]);
    }

    private function statusUrl(Booking $booking): string
    {
        return "/api/v1/admin/bookings/{$booking->id}/status";
    }
}
