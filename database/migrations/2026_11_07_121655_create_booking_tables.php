
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Main bookings
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 32)->unique();

            $table->string('booking_type', 30);
            $table->string('status', 40)->default('Hold');

            // Customer information
            $table->string('customer_name', 160);
            $table->string('customer_email', 180)->nullable();
            $table->string('customer_mobile', 30);

            // Event information
            $table->date('event_date')->nullable();
            $table->string('occasion', 50)->nullable();
            $table->unsignedSmallInteger('guest_count')->nullable();
            $table->time('preferred_start_time')->nullable();
            $table->time('preferred_end_time')->nullable();

            // Venue and fulfillment
            $table->string('venue_type', 40)->nullable();
            $table->text('venue_address')->nullable();
            $table->string('city', 120)->nullable();
            $table->string('fulfillment_type', 30)->nullable();
            $table->text('delivery_notes')->nullable();

            // Additional information
            $table->text('customer_notes')->nullable();
            $table->text('admin_notes')->nullable();

            // Pricing snapshots (whole pesos)
            $table->unsignedBigInteger('subtotal')->default(0);
            $table->unsignedBigInteger('discount')->default(0);
            $table->unsignedBigInteger('total_amount')->default(0);
            $table->unsignedBigInteger('downpayment_amount')->default(0);
            $table->unsignedBigInteger('amount_paid')->default(0);
            $table->unsignedBigInteger('balance_amount')->default(0);

            $table->json('pricing_snapshot')->nullable();

            $table->timestamp('hold_expires_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            $table->index(['event_date', 'status']);
            $table->index(['booking_type', 'status']);
            $table->index('customer_mobile');
        });

        // 2. Booking line items
        Schema::create('booking_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete();

            $table->string('item_type', 40);
            $table->string('catalog_type', 40)->nullable();
            $table->unsignedBigInteger('catalog_id')->nullable();

            // Preserve item details even if catalog data changes
            $table->string('item_code', 100)->nullable();
            $table->string('item_name', 180);
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedBigInteger('unit_price')->default(0);
            $table->unsignedBigInteger('line_total')->default(0);
            $table->json('details')->nullable();

            $table->timestamps();

            $table->index(['catalog_type', 'catalog_id']);
        });

        // 3. Selected dishes for a booking
        Schema::create('booking_menu_picks', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete();

            $table->foreignId('dish_id')
                ->nullable()
                ->constrained('dishes')
                ->nullOnDelete();

            $table->string('dish_name', 160);
            $table->string('category_name', 100)->nullable();
            $table->string('selection_group', 80)->nullable();

            $table->timestamps();
        });

        // 4. Selected add-ons
        Schema::create('booking_add_ons', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete();

            $table->foreignId('add_on_id')
                ->nullable()
                ->constrained('add_ons')
                ->nullOnDelete();

            $table->string('add_on_name', 180);
            $table->unsignedInteger('quantity')->default(1);
            $table->string('price_type', 30)->nullable();
            $table->unsignedBigInteger('unit_price')->default(0);
            $table->unsignedBigInteger('line_total')->default(0);

            $table->timestamps();
        });

        // 5. Temporary date holds
        Schema::create('holds', function (Blueprint $table) {
            $table->id();

            $table->string('session_token', 100)->index();
            $table->date('event_date');
            $table->string('status', 30)->default('active');

            $table->timestamp('expires_at');
            $table->timestamp('released_at')->nullable();

            $table->foreignId('booking_id')
                ->nullable()
                ->constrained('bookings')
                ->nullOnDelete();

            $table->timestamps();

            $table->index(['event_date', 'status']);
            $table->index('expires_at');
        });

        // 6. Date locks (one lock per event date)
        Schema::create('date_locks', function (Blueprint $table) {
            $table->id();

            $table->date('event_date')->unique();
            $table->string('lock_type', 30);

            $table->foreignId('booking_id')
                ->nullable()
                ->unique()
                ->constrained('bookings')
                ->nullOnDelete();

            $table->foreignId('hold_id')
                ->nullable()
                ->unique()
                ->constrained('holds')
                ->nullOnDelete();

            $table->timestamp('expires_at')->nullable();

            $table->timestamps();
        });

        // 7. Saved booking floor plans
        Schema::create('booking_layouts', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete()
                ->unique();

            $table->string('layout_name', 160)->nullable();
            $table->json('layout_data');
            $table->text('notes')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_layouts');
        Schema::dropIfExists('date_locks');
        Schema::dropIfExists('holds');
        Schema::dropIfExists('booking_add_ons');
        Schema::dropIfExists('booking_menu_picks');
        Schema::dropIfExists('booking_items');
        Schema::dropIfExists('bookings');
    }
};
