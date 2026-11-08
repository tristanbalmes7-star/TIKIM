
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Event packages
        Schema::create('event_packages', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->string('occasion', 50);
            $table->unsignedInteger('base_price');
            $table->unsignedSmallInteger('base_guests')->default(100);
            $table->unsignedInteger('extra_guest_price');
            $table->string('price_status', 20)->default('confirmed');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 2. Event package inclusions
        Schema::create('event_package_inclusions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_package_id')
                ->constrained('event_packages')
                ->cascadeOnDelete();
            $table->string('label', 255);
            $table->unsignedSmallInteger('sort_order')->default(0);
        });

        // 3. Food packages
        Schema::create('food_packages', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 120);
            $table->unsignedTinyInteger('level')->unique();
            $table->unsignedInteger('rate_per_guest');
            $table->unsignedSmallInteger('dish_count')->default(0);
            $table->json('slot_rules')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 4. Dish categories
        Schema::create('dish_categories', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 100);
            $table->unsignedInteger('extra_dish_price_per_guest')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // 5. Dishes
        Schema::create('dishes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->foreignId('dish_category_id')
                ->constrained('dish_categories')
                ->restrictOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->string('slug', 180)->nullable()->unique();
            $table->boolean('is_special')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 6. Add-ons
        Schema::create('add_ons', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('label', 180);
            $table->string('price_type', 30);
            $table->unsignedInteger('unit_price')->nullable();
            $table->string('price_status', 30)->default('confirmed');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 7. Add-on availability by occasion
        Schema::create('add_on_occasions', function (Blueprint $table) {
            $table->foreignId('add_on_id')
                ->constrained('add_ons')
                ->cascadeOnDelete();
            $table->string('occasion', 50);

            $table->primary(['add_on_id', 'occasion']);
        });

        // 8. Tray categories
        Schema::create('tray_categories', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 100);
            $table->unsignedInteger('price_per_tray');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 9. Trays
        Schema::create('trays', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->foreignId('tray_category_id')
                ->constrained('tray_categories')
                ->restrictOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trays');
        Schema::dropIfExists('tray_categories');
        Schema::dropIfExists('add_on_occasions');
        Schema::dropIfExists('add_ons');
        Schema::dropIfExists('dishes');
        Schema::dropIfExists('dish_categories');
        Schema::dropIfExists('food_packages');
        Schema::dropIfExists('event_package_inclusions');
        Schema::dropIfExists('event_packages');
    }
};
