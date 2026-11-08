
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Customer inquiries
        Schema::create('inquiries', function (Blueprint $table) {
            $table->id();

            $table->string('reference', 40)->unique();
            $table->string('customer_name', 160);
            $table->string('customer_email', 180)->nullable();
            $table->string('customer_mobile', 30)->nullable();

            $table->string('subject', 180)->nullable();
            $table->text('message');

            $table->string('status', 30)->default('New');
            $table->text('admin_reply')->nullable();

            $table->foreignId('assigned_to')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('replied_at')->nullable();
            $table->timestamp('resolved_at')->nullable();

            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('customer_email');
        });

        // 2. SMS notification logs
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->nullable()
                ->constrained('bookings')
                ->nullOnDelete();

            $table->string('recipient', 30);
            $table->string('message_type', 60);
            $table->text('message');

            $table->string('provider', 40)->default('log');
            $table->string('status', 30)->default('Queued');

            $table->string('provider_reference', 120)->nullable();
            $table->text('error_message')->nullable();

            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();

            $table->timestamps();

            $table->index(['booking_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });

        // 3. Booking change requests
        Schema::create('booking_change_requests', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete();

            $table->string('reference', 40)->unique();

            $table->string('requested_by', 30)->default('customer');
            $table->string('change_type', 60);

            $table->json('current_values')->nullable();
            $table->json('requested_values');

            $table->text('reason')->nullable();

            $table->string('status', 30)->default('Pending');

            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->text('admin_remarks')->nullable();

            $table->timestamp('reviewed_at')->nullable();

            $table->timestamps();

            $table->index(['booking_id', 'status']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_change_requests');
        Schema::dropIfExists('sms_logs');
        Schema::dropIfExists('inquiries');
    }
};
