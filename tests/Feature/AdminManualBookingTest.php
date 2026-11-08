<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DateLock;
use App\Models\Hold;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminManualBookingTest extends TestCase
{
    use RefreshDatabase;

    private string $eventPackageCode = 'MANUAL-EVENT';
    private string $dishCode = 'MANUAL-DISH';
    private string $addOnCode = 'MANUAL-ADDON';
    private string $trayCode = 'MANUAL-TRAY';

    protected function setUp(): void
    {
        parent::setUp();

        DB::table('system_settings')->insert([
            'setting_key' => 'pricing_rules',
            'setting_value' => json_encode([
                'downpaymentPercent' => 40,
                'minPax' => 75,
                'underMinFlat' => 15000,
                'extraDishPer100' => ['chicken' => 3000],
            ]),
            'value_type' => 'json',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('event_packages')->insert([
            'code' => $this->eventPackageCode,
            'name' => 'Manual Test Event Package',
            'occasion' => 'party',
            'base_price' => 10000,
            'base_guests' => 100,
            'extra_guest_price' => 100,
            'price_status' => 'confirmed',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        foreach ([1 => 100, 2 => 200, 3 => 300] as $level => $rate) {
            DB::table('food_packages')->insert([
                'code' => 'MANUAL-FOOD-' . $level,
                'name' => 'Manual Test Food Level ' . $level,
                'level' => $level,
                'rate_per_guest' => $rate,
                'dish_count' => 2,
                'slot_rules' => json_encode([]),
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        $categoryId = DB::table('dish_categories')->insertGetId([
            'code' => 'MANUAL-CATEGORY',
            'name' => 'Chicken',
            'extra_dish_price_per_guest' => 30,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('dishes')->insert([
            'code' => $this->dishCode,
            'dish_category_id' => $categoryId,
            'name' => 'Manual Test Dish',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('add_ons')->insert([
            'code' => $this->addOnCode,
            'label' => 'Manual Test Add-on',
            'price_type' => 'fixed',
            'unit_price' => 500,
            'price_status' => 'confirmed',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $trayCategoryId = DB::table('tray_categories')->insertGetId([
            'code' => 'MANUAL-TRAY-CATEGORY',
            'name' => 'Manual Test Trays',
            'price_per_tray' => 750,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('trays')->insert([
            'code' => $this->trayCode,
            'tray_category_id' => $trayCategoryId,
            'name' => 'Manual Test Tray',
            'description' => 'Feature test tray',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_unauthenticated_users_cannot_create_manual_bookings(): void
    {
        $this->postJson('/api/v1/admin/bookings/manual', $this->eventPayload())
            ->assertUnauthorized();
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_only_event_coordinators_can_create_manual_bookings(): void
    {
        $viewer = User::factory()->create([
            'username' => 'manual-viewer-' . Str::lower(Str::random(8)),
            'role' => 'Viewer',
        ]);

        $this->actingAs($viewer)
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload())
            ->assertForbidden();

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_manual_price_preview_calculates_event_food_and_tray_prices_without_writes(): void
    {
        $coordinator = $this->coordinator();

        $event = $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload([
                'addOns' => [['id' => $this->addOnCode, 'quantity' => 2]],
            ]))
            ->assertOk()
            ->assertJsonPath('preview.subtotal', 11000)
            ->assertJsonPath('preview.discount', 0)
            ->assertJsonPath('preview.total', 11000)
            ->assertJsonPath('preview.paymentAmount', 4400)
            ->assertJsonPath('preview.paymentPercent', 40)
            ->assertJsonPath('preview.paymentLabel', 'Required downpayment');

        $this->assertSame(2, $event->json('preview.lines.1.quantity'));

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->foodPayload([
                'level' => 2,
                'pax' => 100,
            ]))
            ->assertOk()
            ->assertJsonPath('preview.subtotal', 20000)
            ->assertJsonPath('preview.paymentAmount', 8000)
            ->assertJsonPath('preview.paymentPercent', 40);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', [
                'type' => 'trays',
                'trays' => [['id' => $this->trayCode, 'qty' => 2]],
            ])
            ->assertOk()
            ->assertJsonPath('preview.subtotal', 1500)
            ->assertJsonPath('preview.discount', 0)
            ->assertJsonPath('preview.paymentAmount', 1500)
            ->assertJsonPath('preview.paymentPercent', 100)
            ->assertJsonPath('preview.paymentLabel', 'Full payment');

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booking_items', 0);
        $this->assertDatabaseCount('holds', 0);
        $this->assertDatabaseCount('date_locks', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_manual_price_preview_reprices_changed_catalog_selections_and_quantities(): void
    {
        $coordinator = $this->coordinator();
        $date = now()->addDays(30)->toDateString();

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload([
                'eventDate' => $date,
                'addOns' => [['id' => $this->addOnCode, 'quantity' => 1]],
            ]))
            ->assertOk()
            ->assertJsonPath('preview.total', 10500);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload([
                'eventDate' => $date,
                'addOns' => [['id' => $this->addOnCode, 'quantity' => 3]],
            ]))
            ->assertOk()
            ->assertJsonPath('preview.total', 11500);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->foodPayload([
                'level' => 1,
                'pax' => 100,
            ]))
            ->assertOk()
            ->assertJsonPath('preview.total', 10000);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->foodPayload([
                'level' => 2,
                'pax' => 100,
            ]))
            ->assertOk()
            ->assertJsonPath('preview.total', 20000);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', [
                'type' => 'trays',
                'trays' => [['id' => $this->trayCode, 'qty' => 1]],
            ])
            ->assertOk()
            ->assertJsonPath('preview.total', 750);

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', [
                'type' => 'trays',
                'trays' => [['id' => $this->trayCode, 'qty' => 3]],
            ])
            ->assertOk()
            ->assertJsonPath('preview.total', 2250);

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('holds', 0);
        $this->assertDatabaseCount('date_locks', 0);
    }

    public function test_manual_price_preview_rejects_unauthorized_users_and_invalid_catalog_choices(): void
    {
        $this->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload())
            ->assertUnauthorized();

        $viewer = User::factory()->create([
            'username' => 'manual-preview-viewer-' . Str::lower(Str::random(8)),
            'role' => 'Viewer',
        ]);
        $this->actingAs($viewer)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload())
            ->assertForbidden();

        $coordinator = $this->coordinator();
        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', $this->eventPayload([
                'packageId' => 'MISSING-PACKAGE',
            ]))
            ->assertUnprocessable();

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', [
                'type' => 'trays',
                'trays' => [['id' => 'MISSING-TRAY', 'qty' => 1]],
            ])
            ->assertUnprocessable();

        $this->actingAs($coordinator)
            ->postJson('/api/v1/admin/bookings/manual/preview', [
                'type' => 'trays',
                'trays' => [['id' => $this->trayCode, 'qty' => 0]],
            ])
            ->assertUnprocessable();

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booking_items', 0);
        $this->assertDatabaseCount('holds', 0);
        $this->assertDatabaseCount('date_locks', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_event_manual_booking_uses_catalog_prices_and_creates_server_hold_and_date_lock(): void
    {
        $date = now()->addDays(30)->toDateString();
        $response = $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload([
                'eventDate' => $date,
                'dishes' => [$this->dishCode],
                'addOns' => [['id' => $this->addOnCode, 'quantity' => 2]],
            ]))
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('booking.status', 'Hold (48 Hours)')
            ->assertJsonPath('booking.subtotal', 11000)
            ->assertJsonPath('booking.total', 11000)
            ->assertJsonPath('booking.downpaymentRequired', 4400);

        $reference = $response->json('booking.ref');
        $this->assertMatchesRegularExpression('/^TK-\d{6}-[A-Z0-9]{3}$/', $reference);
        $booking = Booking::where('reference', $reference)->firstOrFail();
        $this->assertSame(0, $booking->discount);
        $this->assertSame(0, $booking->amount_paid);
        $this->assertSame(11000, $booking->balance_amount);
        $this->assertNotNull($booking->hold_expires_at);
        $this->assertTrue($booking->hold_expires_at->between(
            Carbon::now()->addHours(47)->subMinute(),
            Carbon::now()->addHours(48)->addMinute()
        ));
        $this->assertDatabaseHas('booking_items', [
            'booking_id' => $booking->id,
            'catalog_type' => 'event_package',
            'unit_price' => 10000,
            'line_total' => 10000,
        ]);
        $this->assertDatabaseHas('booking_items', [
            'booking_id' => $booking->id,
            'catalog_type' => 'add_on',
            'unit_price' => 500,
            'line_total' => 1000,
        ]);
        $this->assertDatabaseHas('booking_menu_picks', [
            'booking_id' => $booking->id,
            'dish_name' => 'Manual Test Dish',
        ]);
        $dateLock = DateLock::whereDate('event_date', $date)->firstOrFail();
        $this->assertSame($booking->id, $dateLock->booking_id);
        $this->assertSame('booking', $dateLock->lock_type);
        $this->assertNull($dateLock->expires_at);
        $hold = Hold::where('booking_id', $booking->id)->firstOrFail();
        $this->assertSame('converted', $hold->status);
        $this->assertSame(0, $booking->payments()->count());

        $this->actingAs($this->coordinator())
            ->getJson('/api/v1/admin/bookings')
            ->assertOk()
            ->assertJsonFragment(['ref' => $reference]);
    }

    public function test_food_manual_booking_uses_food_pricing_and_creates_hold(): void
    {
        $date = now()->addDays(31)->toDateString();
        $response = $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->foodPayload([
                'eventDate' => $date,
                'level' => 2,
                'pax' => 100,
            ]))
            ->assertCreated()
            ->assertJsonPath('booking.status', 'Hold (48 Hours)')
            ->assertJsonPath('booking.total', 20000)
            ->assertJsonPath('booking.downpaymentRequired', 8000);

        $booking = Booking::where('reference', $response->json('booking.ref'))->firstOrFail();
        $this->assertSame(0, $booking->discount);
        $this->assertSame(0, $booking->payments()->count());
        $this->assertDatabaseHas('booking_items', [
            'booking_id' => $booking->id,
            'catalog_type' => 'food_package',
            'unit_price' => 200,
            'quantity' => 100,
            'line_total' => 20000,
        ]);
        $dateLock = DateLock::whereDate('event_date', $date)->firstOrFail();
        $this->assertSame($booking->id, $dateLock->booking_id);
        $this->assertSame('booking', $dateLock->lock_type);
    }

    public function test_food_tray_manual_booking_uses_full_payment_without_hold_or_date_lock(): void
    {
        $date = now()->addDays(32)->toDateString();
        $response = $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', [
                'type' => 'trays',
                'customerName' => 'Tray Test Customer',
                'mobile' => '09171234567',
                'eventDate' => $date,
                'trays' => [['id' => $this->trayCode, 'qty' => 2]],
            ])
            ->assertCreated()
            ->assertJsonPath('booking.status', 'Pending Verification')
            ->assertJsonPath('booking.total', 1500)
            ->assertJsonPath('booking.downpaymentRequired', 1500);

        $booking = Booking::where('reference', $response->json('booking.ref'))->firstOrFail();
        $this->assertSame(100.0, (float) $booking->pricing_snapshot['downpayment_percent']);
        $this->assertSame(0, $booking->discount);
        $this->assertSame(0, $booking->payments()->count());
        $this->assertDatabaseHas('booking_items', [
            'booking_id' => $booking->id,
            'item_type' => 'tray',
            'unit_price' => 750,
            'quantity' => 2,
            'line_total' => 1500,
        ]);
        $this->assertDatabaseMissing('date_locks', ['event_date' => $date]);
        $this->assertDatabaseCount('holds', 0);
    }

    public function test_client_financial_status_and_hold_values_are_rejected_without_writes(): void
    {
        $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload([
                'reference' => 'TK-261108-ABC',
                'unit_price' => 1,
                'subtotal' => 1,
                'discount' => 1,
                'total' => 1,
                'downpayment_amount' => 1,
                'amount_paid' => 1,
                'payment_amount' => 1,
                'status' => 'Confirmed',
                'hold_expires_at' => now()->addYear()->toISOString(),
            ]))
            ->assertUnprocessable();

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booking_items', 0);
        $this->assertDatabaseCount('holds', 0);
        $this->assertDatabaseCount('date_locks', 0);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_invalid_catalog_selections_and_required_fields_are_rejected_without_partial_booking(): void
    {
        $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload([
                'packageId' => 'INACTIVE-OR-MISSING',
                'dishes' => ['MISSING-DISH'],
            ]))
            ->assertUnprocessable();

        $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', [
                'type' => 'food',
                'customerName' => '',
                'mobile' => '0917',
                'eventDate' => 'not-a-date',
                'level' => 99,
                'pax' => 0,
            ])
            ->assertUnprocessable();

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booking_items', 0);
        $this->assertDatabaseCount('holds', 0);
        $this->assertDatabaseCount('date_locks', 0);
    }

    public function test_occupied_date_rejects_another_manual_booking_and_keeps_a_single_lock(): void
    {
        $date = now()->addDays(33)->toDateString();
        $first = $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload(['eventDate' => $date]))
            ->assertCreated();

        $this->actingAs($this->coordinator())
            ->postJson('/api/v1/admin/bookings/manual', $this->eventPayload(['eventDate' => $date]))
            ->assertStatus(409);

        $bookingId = Booking::where('reference', $first->json('booking.ref'))->value('id');
        $this->assertSame(1, DateLock::whereDate('event_date', $date)->count());
        $this->assertSame(1, Booking::whereDate('event_date', $date)->count());
        $this->assertSame(
            $bookingId,
            DateLock::whereDate('event_date', $date)->value('booking_id')
        );
    }

    private function coordinator(): User
    {
        return User::factory()->create([
            'username' => 'manual-coordinator-' . Str::lower(Str::random(8)),
            'role' => 'Event Coordinator',
        ]);
    }

    private function eventPayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'event',
            'customerName' => 'Manual Test Customer',
            'mobile' => '09171234567',
            'eventDate' => now()->addDays(30)->toDateString(),
            'packageId' => $this->eventPackageCode,
            'level' => 1,
            'pax' => 100,
        ], $overrides);
    }

    private function foodPayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'food',
            'customerName' => 'Manual Food Customer',
            'mobile' => '09171234567',
            'eventDate' => now()->addDays(31)->toDateString(),
            'level' => 1,
            'pax' => 100,
        ], $overrides);
    }
}
