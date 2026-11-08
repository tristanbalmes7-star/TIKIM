
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Payment transactions
        Schema::create('payments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->cascadeOnDelete();

            $table->string('reference', 40)->unique();
            $table->string('payment_type', 40);
            $table->string('payment_method', 40);

            $table->unsignedBigInteger('amount');

            $table->string('status', 40)->default('Pending Verification');

            $table->string('account_name', 160)->nullable();
            $table->string('transaction_number', 120)->nullable();

            $table->text('admin_remarks')->nullable();

            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('verified_at')->nullable();

            $table->timestamps();

            $table->index(['booking_id', 'status']);
            $table->index('payment_method');
        });

        // 2. Uploaded payment receipts
        Schema::create('payment_receipts', function (Blueprint $table) {
            $table->id();

            $table->foreignId('payment_id')
                ->constrained('payments')
                ->cascadeOnDelete();

            $table->string('original_filename', 255);
            $table->string('stored_filename', 255);
            $table->string('storage_path', 500);

            $table->string('mime_type', 100);
            $table->unsignedInteger('file_size');
            $table->string('sha256_hash', 64);

            $table->timestamps();

            $table->index('sha256_hash');
        });

        // 3. Payment status history and audit trail
        Schema::create('payment_logs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('payment_id')
                ->constrained('payments')
                ->cascadeOnDelete();

            $table->foreignId('performed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('action', 60);
            $table->string('previous_status', 40)->nullable();
            $table->string('new_status', 40)->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->index(['payment_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_logs');
        Schema::dropIfExists('payment_receipts');
        Schema::dropIfExists('payments');
    }
};
