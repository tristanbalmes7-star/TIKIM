<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminBookingListingTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_list_bookings(): void
    {
        $this->getJson('/api/v1/admin/bookings')
            ->assertUnauthorized();
    }

    public function test_authenticated_user_without_event_coordinator_role_is_forbidden(): void
    {
        $user = User::factory()->create([
            'username' => 'booking-viewer',
            'role' => 'Viewer',
        ]);

        $this->actingAs($user)
            ->getJson('/api/v1/admin/bookings')
            ->assertForbidden();
    }

    public function test_event_coordinator_can_list_bookings_with_stored_financial_values(): void
    {
        $organizer = User::factory()->create([
            'username' => 'booking-organizer',
            'role' => 'Event Coordinator',
        ]);
        $booking = $this->booking([
            'reference' => 'TK-ADMIN-LIST-001',
            'booking_type' => 'event',
            'status' => 'Confirmed',
            'guest_count' => 120,
            'total_amount' => 146960,
            'amount_paid' => 73480,
            'balance_amount' => 73480,
        ]);

        $this->actingAs($organizer)
            ->getJson('/api/v1/admin/bookings')
            ->assertOk()
            ->assertJsonCount(1, 'bookings')
            ->assertJsonPath('bookings.0.id', $booking->id)
            ->assertJsonPath('bookings.0.ref', 'TK-ADMIN-LIST-001')
            ->assertJsonPath('bookings.0.customer.name', 'Admin List Test')
            ->assertJsonPath('bookings.0.customer.mobile', '09171234567')
            ->assertJsonPath('bookings.0.type', 'event')
            ->assertJsonPath('bookings.0.eventDate', $booking->event_date->toDateString())
            ->assertJsonPath('bookings.0.pax', 120)
            ->assertJsonPath('bookings.0.status', 'Confirmed')
            ->assertJsonPath('bookings.0.total', 146960)
            ->assertJsonPath('bookings.0.paidAmount', 73480)
            ->assertJsonPath('bookings.0.balance', 73480)
            ->assertJsonPath('bookings.0.createdAt', $booking->created_at->toIso8601String());
    }

    public function test_empty_booking_list_returns_an_empty_array(): void
    {
        $organizer = User::factory()->create([
            'username' => 'empty-list-organizer',
            'role' => 'Event Coordinator',
        ]);

        $this->actingAs($organizer)
            ->getJson('/api/v1/admin/bookings')
            ->assertOk()
            ->assertExactJson(['bookings' => []]);
    }

    public function test_expired_bookings_remain_visible_to_the_organizer(): void
    {
        $organizer = User::factory()->create([
            'username' => 'expired-list-organizer',
            'role' => 'Event Coordinator',
        ]);
        $booking = $this->booking([
            'reference' => 'TK-ADMIN-EXPIRED-001',
            'booking_type' => 'food',
            'status' => 'Expired',
        ]);

        $this->actingAs($organizer)
            ->getJson('/api/v1/admin/bookings')
            ->assertOk()
            ->assertJsonCount(1, 'bookings')
            ->assertJsonPath('bookings.0.ref', $booking->reference)
            ->assertJsonPath('bookings.0.status', 'Expired');
    }

    public function test_listing_uses_approved_payment_rows_for_financial_values(): void
    {
        $organizer = User::factory()->create([
            'username' => 'financial-list-organizer',
            'role' => 'Event Coordinator',
        ]);
        $booking = $this->booking([
            'reference' => 'TK-ADMIN-LIST-TRAYS-001',
            'booking_type' => 'trays',
            'status' => 'Fully Paid',
            'total_amount' => 1600,
            'amount_paid' => 0,
            'balance_amount' => 0,
        ]);
        Payment::create([
            'booking_id' => $booking->id,
            'reference' => 'PAY-ADMIN-LIST-TRAYS-001',
            'payment_type' => 'Full Payment',
            'payment_method' => 'GCash',
            'amount' => 1600,
            'status' => 'Approved',
        ]);

        $this->actingAs($organizer)
            ->getJson('/api/v1/admin/bookings')
            ->assertOk()
            ->assertJsonPath('bookings.0.total', 1600)
            ->assertJsonPath('bookings.0.paidAmount', 1600)
            ->assertJsonPath('bookings.0.balance', 0);
    }

    private function booking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'reference' => 'TK-ADMIN-LIST-' . strtoupper(bin2hex(random_bytes(3))),
            'booking_type' => 'event',
            'status' => 'Hold (48 Hours)',
            'customer_name' => 'Admin List Test',
            'customer_mobile' => '09171234567',
            'event_date' => now()->addWeek()->toDateString(),
            'guest_count' => 100,
            'total_amount' => 100000,
            'downpayment_amount' => 50000,
            'amount_paid' => 0,
            'balance_amount' => 100000,
        ], $overrides));
    }
}
