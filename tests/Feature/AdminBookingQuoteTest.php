<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingItem;
use App\Models\DateLock;
use App\Models\Hold;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminBookingQuoteTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_users_cannot_read_or_update_admin_quotes(): void
    {
        $booking = $this->bookingWithQuote();

        $this->getJson($this->quoteUrl($booking))->assertUnauthorized();
        $this->patchJson($this->quoteUrl($booking), $this->quotePayload())
            ->assertUnauthorized();
    }

    public function test_non_coordinators_cannot_read_or_update_admin_quotes(): void
    {
        $viewer = User::factory()->create([
            'username' => 'quote-viewer-' . Str::lower(Str::random(8)),
            'role' => 'Viewer',
        ]);
        $booking = $this->bookingWithQuote();

        $this->actingAs($viewer)
            ->getJson($this->quoteUrl($booking))
            ->assertForbidden();
        $this->actingAs($viewer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload())
            ->assertForbidden();
    }

    public function test_event_quote_update_preserves_original_downpayment_ratio_and_saves_revision_history(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote([
            'downpayment_amount' => 400,
            'quote_percent' => 40,
        ]);
        $lock = $this->bookingLock($booking);
        $specialItem = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $response = $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [[
                    'booking_item_id' => $specialItem->id,
                    'unit_price' => 500,
                ]],
                'discount' => 100,
                'reason' => 'Confirmed the special dish price with the vendor.',
            ]))
            ->assertOk()
            ->assertJsonPath('booking.total', 1400)
            ->assertJsonPath('booking.downpaymentRequired', 560)
            ->assertJsonPath('booking.balance', 1400)
            ->assertJsonPath('booking.status', 'Confirmed')
            ->assertJsonPath('booking.downpaymentPercent', 40);

        $booking->refresh();
        $this->assertSame(1500, $booking->subtotal);
        $this->assertSame(100, $booking->discount);
        $this->assertSame(1400, $booking->total_amount);
        $this->assertSame(560, $booking->downpayment_amount);
        $this->assertSame(0, $booking->amount_paid);
        $this->assertSame(1400, $booking->balance_amount);
        $this->assertEquals(40, $booking->pricing_snapshot['downpayment_percent']);
        $this->assertSame(
            'Confirmed the special dish price with the vendor.',
            $booking->pricing_snapshot['quote_revisions'][0]['reason']
        );
        $this->assertSame(1000, $booking->pricing_snapshot['quote_revisions'][0]['previous']['total_amount']);
        $this->assertDatabaseHas('booking_items', [
            'id' => $specialItem->id,
            'unit_price' => 500,
            'line_total' => 500,
        ]);
        $this->assertDatabaseHas('date_locks', ['id' => $lock->id, 'booking_id' => $booking->id]);
        $this->assertSame('Confirmed', $booking->status);

        $response->assertJsonPath('booking.quoteSnapshot.lines.0.bookingItemId', $specialItem->id);
    }

    public function test_food_quote_update_uses_the_booking_original_percentage(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote([
            'booking_type' => 'food',
            'downpayment_amount' => 300,
            'quote_percent' => 30,
        ]);
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 1000]],
            ]))
            ->assertOk()
            ->assertJsonPath('booking.downpaymentRequired', 600);
    }

    public function test_food_trays_keep_full_payment_downpayment_when_quote_changes(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote([
            'booking_type' => 'trays',
            'downpayment_amount' => 1000,
        ]);
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 500]],
            ]))
            ->assertOk()
            ->assertJsonPath('booking.total', 1500)
            ->assertJsonPath('booking.downpaymentRequired', 1500);
    }

    public function test_legacy_event_quote_without_stored_downpayment_percentage_is_rejected_without_changes(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();
        $snapshot = $booking->pricing_snapshot;
        unset($snapshot['downpayment_percent']);
        $booking->pricing_snapshot = $snapshot;
        $booking->save();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 250]],
            ]))
            ->assertConflict()
            ->assertJsonPath('message', 'This booking has no reliable stored downpayment percentage. Its quote cannot be safely revised.');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'total_amount' => 1000,
            'downpayment_amount' => 500,
        ]);
        $this->assertDatabaseHas('booking_items', ['id' => $item->id, 'unit_price' => 0]);
    }

    public function test_successive_quote_revisions_preserve_history_actor_and_timestamps(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->travelTo(now()->startOfSecond());
        $firstTime = now()->toIso8601String();
        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 100]],
                'reason' => 'First revision.',
            ]))
            ->assertOk();

        $this->travel(1)->second();
        $secondTime = now()->toIso8601String();
        $this->patchJson($this->quoteUrl($booking), $this->quotePayload([
            'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 200]],
            'reason' => 'Second revision.',
        ]))->assertOk();

        $revisions = $booking->fresh()->pricing_snapshot['quote_revisions'];
        $this->assertCount(2, $revisions);
        $this->assertSame('First revision.', $revisions[0]['reason']);
        $this->assertSame('Second revision.', $revisions[1]['reason']);
        $this->assertSame($organizer->id, $revisions[0]['revised_by']);
        $this->assertSame($organizer->id, $revisions[1]['revised_by']);
        $this->assertSame($firstTime, $revisions[0]['revised_at']);
        $this->assertSame($secondTime, $revisions[1]['revised_at']);
        $this->assertSame(1000, $revisions[0]['previous']['total_amount']);
        $this->assertSame(1100, $revisions[1]['previous']['total_amount']);
        $this->travelBack();
    }

    public function test_stale_or_cross_booking_item_id_cannot_update_another_booking(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $otherBooking = $this->bookingWithQuote();
        $otherItem = $otherBooking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $otherItem->id, 'unit_price' => 900]],
            ]))
            ->assertStatus(422);

        $this->assertDatabaseHas('booking_items', ['id' => $otherItem->id, 'unit_price' => 0]);
        $this->assertDatabaseHas('bookings', ['id' => $otherBooking->id, 'total_amount' => 1000]);

        $this->patchJson($this->quoteUrl($booking), $this->quotePayload([
            'line_overrides' => [['booking_item_id' => 999999, 'unit_price' => 900]],
        ]))->assertStatus(422);
        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'total_amount' => 1000]);
    }

    public function test_pending_payment_blocks_quote_changes_without_modifying_booking(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();
        $pending = $this->payment($booking, 'Pending Verification', 500);

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 200]],
            ]))
            ->assertConflict()
            ->assertJsonPath('message', 'This quote cannot be revised while a payment is awaiting verification.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'total_amount' => 1000]);
        $this->assertDatabaseHas('booking_items', ['id' => $item->id, 'unit_price' => 0]);
        $this->assertDatabaseHas('payments', ['id' => $pending->id, 'status' => 'Pending Verification']);
    }

    public function test_approved_payments_count_and_all_payment_records_are_preserved(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote([
            'amount_paid' => 200,
            'balance_amount' => 800,
        ]);
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();
        $approved = $this->payment($booking, 'Approved', 200);
        $rejected = $this->payment($booking, 'Rejected', 700);

        $this->actingAs($organizer)
            ->getJson($this->quoteUrl($booking))
            ->assertOk()
            ->assertJsonPath('booking.paidAmount', 200);

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 300]],
            ]))
            ->assertOk()
            ->assertJsonPath('booking.total', 1300)
            ->assertJsonPath('booking.paidAmount', 200)
            ->assertJsonPath('booking.balance', 1100);

        $this->assertDatabaseHas('payments', ['id' => $approved->id, 'status' => 'Approved', 'amount' => 200]);
        $this->assertDatabaseHas('payments', ['id' => $rejected->id, 'status' => 'Rejected', 'amount' => 700]);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'amount_paid' => 200,
            'balance_amount' => 1100,
        ]);
    }

    public function test_revised_total_cannot_be_less_than_approved_payments(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote([
            'amount_paid' => 800,
            'balance_amount' => 200,
        ]);
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();
        $this->payment($booking, 'Approved', 800);

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 0]],
                'discount' => 300,
            ]))
            ->assertConflict()
            ->assertJsonPath('message', 'The revised total cannot be lower than the approved payment total.');

        $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'total_amount' => 1000]);
    }

    public function test_negative_prices_invalid_discounts_and_client_calculated_totals_are_rejected(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => -1]],
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('line_overrides.0.unit_price');

        $this->patchJson($this->quoteUrl($booking), $this->quotePayload(['discount' => -1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('discount');
        $this->patchJson($this->quoteUrl($booking), $this->quotePayload(['discount' => 1001]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('discount');
        $this->patchJson($this->quoteUrl($booking), $this->quotePayload(['total_amount' => 1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('total_amount');
    }

    public function test_revision_reason_is_required_and_cannot_be_only_whitespace(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload(['reason' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
        $this->patchJson($this->quoteUrl($booking), $this->quotePayload(['reason' => '   ']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
    }

    public function test_cancelled_expired_and_completed_bookings_cannot_be_revised(): void
    {
        $organizer = $this->organizer();

        foreach (['Cancelled', 'Expired', 'Completed'] as $status) {
            $booking = $this->bookingWithQuote(['status' => $status]);

            $this->actingAs($organizer)
                ->patchJson($this->quoteUrl($booking), $this->quotePayload())
                ->assertConflict()
                ->assertJsonPath('message', 'Quotes can only be revised for active bookings.');

            $this->assertDatabaseHas('bookings', ['id' => $booking->id, 'status' => $status]);
        }
    }

    public function test_quote_detail_uses_persisted_booking_item_ids_and_customer_track_returns_updated_quote(): void
    {
        $organizer = $this->organizer();
        $booking = $this->bookingWithQuote();
        $lock = $this->bookingLock($booking);
        $item = $booking->items()->where('item_type', 'special_dish')->firstOrFail();

        $this->actingAs($organizer)
            ->getJson($this->quoteUrl($booking))
            ->assertOk()
            ->assertJsonPath('booking.quoteSnapshot.lines.0.bookingItemId', $item->id)
            ->assertJsonPath('booking.downpaymentPercent', 50);

        $this->actingAs($organizer)
            ->patchJson($this->quoteUrl($booking), $this->quotePayload([
                'line_overrides' => [['booking_item_id' => $item->id, 'unit_price' => 250]],
                'reason' => 'Final price approved.',
            ]))
            ->assertOk()
            ->assertJsonPath('booking.quoteSnapshot.lines.0.amount', 250);

        $this->withSession(['tikim.verified_booking_id' => $booking->id])
            ->getJson('/api/v1/bookings/' . $booking->reference)
            ->assertOk()
            ->assertJsonPath('booking.total', 1250)
            ->assertJsonPath('booking.quoteSnapshot.lines.0.amount', 250)
            ->assertJsonPath('booking.quoteSnapshot.lines.0.isTbc', false);

        $this->assertDatabaseHas('date_locks', ['id' => $lock->id, 'booking_id' => $booking->id]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'Confirmed',
        ]);
        $this->assertSame('Confirmed', $booking->fresh()->status);
        $this->assertSame($lock->event_date->toDateString(), $booking->fresh()->event_date->toDateString());
    }

    public function test_new_event_and_food_bookings_persist_the_configured_downpayment_percentage(): void
    {
        foreach (['event', 'food'] as $type) {
            $percentage = $type === 'event' ? 37.5 : 63;
            $booking = $this->createCustomerBooking($type, $percentage);

            $this->assertSame(
                (float) $percentage,
                (float) $booking->pricing_snapshot['downpayment_percent']
            );
            $this->assertSame(
                (int) round($booking->total_amount * $percentage / 100),
                $booking->downpayment_amount
            );
        }
    }

    public function test_new_food_trays_booking_persists_one_hundred_percent_downpayment(): void
    {
        $booking = $this->createCustomerBooking('trays', 35);

        $this->assertSame(100.0, (float) $booking->pricing_snapshot['downpayment_percent']);
        $this->assertSame($booking->total_amount, $booking->downpayment_amount);
    }

    private function organizer(): User
    {
        return User::factory()->create([
            'username' => 'quote-organizer-' . Str::lower(Str::random(8)),
            'role' => 'Event Coordinator',
        ]);
    }

    private function bookingWithQuote(array $overrides = []): Booking
    {
        static $sequence = 0;
        $sequence++;
        $type = $overrides['booking_type'] ?? 'event';
        $fixedItemType = $type === 'trays' ? 'tray' : 'food_package';
        $fixedCatalogType = $type === 'trays' ? 'tray' : 'food_package';
        $fixedItemName = $type === 'trays' ? 'Tray Order' : 'Base Package';
        $downpaymentPercent = $overrides['quote_percent'] ?? ($type === 'trays' ? 100 : 50);

        $booking = Booking::create(array_merge([
            'reference' => 'TK-QUOTE-' . Str::upper(Str::random(8)),
            'booking_type' => $type,
            'status' => 'Confirmed',
            'customer_name' => 'Quote Test Customer',
            'customer_mobile' => '09171234567',
            'event_date' => now()->addDays($sequence + 1)->toDateString(),
            'subtotal' => 1000,
            'discount' => 0,
            'total_amount' => 1000,
            'downpayment_amount' => $type === 'trays' ? 1000 : 500,
            'amount_paid' => 0,
            'balance_amount' => 1000,
            'pricing_snapshot' => [
                'downpayment_percent' => $downpaymentPercent,
                'tbc' => true,
                'estimate' => false,
                'lines' => [],
            ],
        ], array_diff_key($overrides, ['quote_percent' => true])));

        $special = BookingItem::create([
            'booking_id' => $booking->id,
            'item_type' => 'special_dish',
            'item_name' => 'Special Dish: Test',
            'quantity' => 1,
            'unit_price' => 0,
            'line_total' => 0,
            'details' => ['price_status' => 'tbc'],
        ]);
        $fixed = BookingItem::create([
            'booking_id' => $booking->id,
            'item_type' => $fixedItemType,
            'catalog_type' => $fixedCatalogType,
            'catalog_id' => 1,
            'item_code' => 'FIXED-ITEM',
            'item_name' => $fixedItemName,
            'quantity' => 1,
            'unit_price' => 1000,
            'line_total' => 1000,
            'details' => [],
        ]);

        $booking->pricing_snapshot = [
            'tbc' => true,
            'estimate' => false,
            'lines' => [
                [
                    'booking_item_id' => $special->id,
                    'name' => $special->item_name,
                    'item_type' => $special->item_type,
                    'unit_price' => 0,
                    'quantity' => 1,
                    'amount' => 0,
                    'details' => $special->details,
                    'catalog_type' => null,
                    'catalog_id' => null,
                    'code' => null,
                ],
                [
                    'booking_item_id' => $fixed->id,
                    'name' => $fixed->item_name,
                    'item_type' => $fixed->item_type,
                    'unit_price' => 1000,
                    'quantity' => 1,
                    'amount' => 1000,
                    'details' => $fixed->details,
                    'catalog_type' => $fixed->catalog_type,
                    'catalog_id' => $fixed->catalog_id,
                    'code' => $fixed->item_code,
                ],
            ],
            'downpayment_percent' => $downpaymentPercent,
        ];
        $booking->save();

        return $booking;
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

    private function quoteUrl(Booking $booking): string
    {
        return "/api/v1/admin/bookings/{$booking->id}/quote";
    }

    private function quotePayload(array $overrides = []): array
    {
        return array_merge([
            'line_overrides' => [],
            'discount' => 0,
            'reason' => 'Approved quote revision.',
        ], $overrides);
    }

    private function createCustomerBooking(string $type, float $percentage): Booking
    {
        $date = now()->addDays(20 + random_int(0, 100))->toDateString();
        DB::table('system_settings')->updateOrInsert(
            ['setting_key' => 'pricing_rules'],
            [
                'setting_value' => json_encode(['downpaymentPercent' => $percentage]),
                'value_type' => 'json',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        if ($type === 'event') {
            DB::table('event_packages')->insert([
                'code' => 'quote-event-' . Str::lower(Str::random(8)),
                'name' => 'Test Event Package',
                'occasion' => 'party',
                'base_price' => 10000,
                'base_guests' => 100,
                'extra_guest_price' => 100,
                'price_status' => 'confirmed',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (in_array($type, ['event', 'food'], true)) {
            DB::table('food_packages')->insert([
                'code' => 'quote-food-' . Str::lower(Str::random(8)),
                'name' => 'Test Food Package',
                'level' => $type === 'event' ? 1 : 2,
                'rate_per_guest' => 100,
                'dish_count' => 1,
                'slot_rules' => json_encode([]),
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $token = Str::random(40);
            $hold = Hold::create([
                'session_token' => $token,
                'event_date' => $date,
                'status' => 'active',
                'expires_at' => now()->addHours(2),
            ]);
            DateLock::create([
                'event_date' => $date,
                'lock_type' => 'hold',
                'hold_id' => $hold->id,
                'expires_at' => $hold->expires_at,
            ]);
        } else {
            $categoryId = DB::table('tray_categories')->insertGetId([
                'code' => 'quote-tray-category-' . Str::lower(Str::random(8)),
                'name' => 'Test Tray Category',
                'price_per_tray' => 750,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('trays')->insert([
                'code' => 'quote-tray-' . Str::lower(Str::random(8)),
                'tray_category_id' => $categoryId,
                'name' => 'Test Tray',
                'description' => 'Test',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $payload = [
            'type' => $type,
            'customerName' => 'Quote Creation Test',
            'mobile' => '09171234567',
            'eventDate' => $date,
            'pax' => 100,
            'level' => $type === 'food' ? 2 : 1,
            'packageId' => $type === 'event'
                ? DB::table('event_packages')->where('occasion', 'party')->value('code')
                : null,
            'dishes' => [],
            'trays' => [],
        ];
        if ($type !== 'trays') {
            $payload['session_token'] = $token;
        } else {
            $payload['trays'] = [[
                'id' => DB::table('trays')->where('name', 'Test Tray')->value('code'),
                'qty' => 1,
            ]];
        }

        $response = $this->postJson('/api/v1/bookings', $payload);
        $response->assertCreated();

        return Booking::where('reference', $response->json('booking.ref'))->firstOrFail();
    }
}
