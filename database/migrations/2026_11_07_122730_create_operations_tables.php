
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Inventory items
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();

            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->string('category', 100)->nullable();

            $table->decimal('quantity', 12, 2)->default(0);
            $table->string('unit', 40)->default('pcs');

            $table->decimal('minimum_stock', 12, 2)->default(0);
            $table->unsignedBigInteger('unit_cost')->default(0);

            $table->string('status', 30)->default('Active');
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['category', 'status']);
        });

        // 2. Inventory movement history
        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();

            $table->foreignId('inventory_item_id')
                ->constrained('inventory_items')
                ->restrictOnDelete();

            $table->foreignId('performed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('transaction_type', 30);
            $table->decimal('quantity', 12, 2);

            $table->decimal('previous_quantity', 12, 2);
            $table->decimal('new_quantity', 12, 2);

            $table->string('reference', 100)->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->index(['inventory_item_id', 'created_at']);
        });

        // 3. Vendors
        Schema::create('vendors', function (Blueprint $table) {
            $table->id();

            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->string('contact_person', 160)->nullable();

            $table->string('mobile', 30)->nullable();
            $table->string('email', 180)->nullable();

            $table->text('address')->nullable();
            $table->string('category', 100)->nullable();

            $table->text('notes')->nullable();
            $table->string('status', 30)->default('Active');

            $table->timestamps();

            $table->index(['category', 'status']);
        });

        // 4. Event turnover reports
        Schema::create('turnover_reports', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete()
                ->unique();

            $table->foreignId('prepared_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->text('event_summary')->nullable();
            $table->text('issues_encountered')->nullable();
            $table->text('inventory_notes')->nullable();
            $table->text('staff_notes')->nullable();

            $table->json('checklist')->nullable();

            $table->timestamp('event_started_at')->nullable();
            $table->timestamp('event_ended_at')->nullable();
            $table->timestamp('submitted_at')->nullable();

            $table->timestamps();
        });

        // 5. System settings
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();

            $table->string('setting_key', 120)->unique();
            $table->longText('setting_value')->nullable();
            $table->string('value_type', 30)->default('string');

            $table->text('description')->nullable();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();
        });

        // 6. Admin activity logs
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('action', 120);
            $table->string('module', 80)->nullable();

            $table->string('record_type', 100)->nullable();
            $table->unsignedBigInteger('record_id')->nullable();

            $table->text('description')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();

            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            $table->timestamps();

            $table->index(['module', 'created_at']);
            $table->index(['record_type', 'record_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('turnover_reports');
        Schema::dropIfExists('vendors');
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('inventory_items');
    }
};
