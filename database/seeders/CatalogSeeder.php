<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $pricing = $this->readJson('pricing.json');
            $menu = $this->readJson('menu.json');
            $trays = $this->readJson('trays.json');
            $packages = $this->readJson('packages.json');
            $occasions = $this->readJson('occasions.json');

            /*
             * 1. Dish categories and extra-dish prices
             */
            $categoryNames = [
                'chicken' => 'Chicken',
                'beef' => 'Beef',
                'pork' => 'Pork',
                'fish' => 'Fish',
                'vegetables' => 'Vegetables',
                'pasta' => 'Pasta',
                'drinks' => 'Drinks',
                'desserts' => 'Desserts',
                'rice' => 'Rice',
                'special-dishes' => 'Special Dishes',
            ];

            $categoryIds = [];

            foreach ($categoryNames as $code => $name) {
                $extraPrice = $pricing['extraDishPer100'][$code] ?? null;

                $id = DB::table('dish_categories')->updateOrInsert(
                    ['code' => $code],
                    [
                        'name' => $name,
                        'extra_dish_price_per_guest' => $extraPrice
                            ? (int) ceil($extraPrice / 100)
                            : null,
                        'sort_order' => count($categoryIds),
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );

                $categoryIds[$code] = DB::table('dish_categories')
                    ->where('code', $code)
                    ->value('id');
            }

            /*
             * 2. Dishes
             */
            foreach ($menu as $dish) {
                $categoryCode = strtolower(
                    str_replace(' ', '-', $dish['category'])
                );

                if (!isset($categoryIds[$categoryCode])) {
                    throw new RuntimeException(
                        "Unknown dish category: {$dish['category']}"
                    );
                }

                DB::table('dishes')->updateOrInsert(
                    ['code' => $dish['id']],
                    [
                        'dish_category_id' => $categoryIds[$categoryCode],
                        'name' => $dish['name'],
                        'description' => $dish['description'] ?? null,
                        'slug' => $dish['slug'] ?? null,
                        'is_special' => $dish['priceOnRequest'] ?? false,
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }

            /*
             * 3. Food packages
             */
            foreach ($pricing['levels'] as $level) {
                DB::table('food_packages')->updateOrInsert(
                    ['level' => $level['level']],
                    [
                        'code' => 'catering-' . $level['level'],
                        'name' => $level['name'],
                        'rate_per_guest' => $level['perHead'],
                        'dish_count' => $level['dishes'],
                        'slot_rules' => json_encode($level['slots']),
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }

            /*
             * 4. Event packages and inclusions
             */
            foreach ($pricing['eventPackages'] as $package) {
                DB::table('event_packages')->updateOrInsert(
                    ['code' => $package['id']],
                    [
                        'name' => $package['name'],
                        'occasion' => $package['occasion'],
                        'base_price' => $package['price'],
                        'base_guests' => $package['basePax'],
                        'extra_guest_price' => $package['extraPerHead'],
                        'price_status' => $package['priceStatus'],
                        'description' => $package['description'] ?? null,
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );

                $eventPackageId = DB::table('event_packages')
                    ->where('code', $package['id'])
                    ->value('id');

                DB::table('event_package_inclusions')
                    ->where('event_package_id', $eventPackageId)
                    ->delete();

                foreach ($package['inclusions'] ?? [] as $index => $inclusion) {
                    DB::table('event_package_inclusions')->insert([
                        'event_package_id' => $eventPackageId,
                        'label' => $inclusion,
                        'sort_order' => $index,
                    ]);
                }
            }

            /*
             * 5. Add-ons and occasion restrictions
             */
            foreach ($pricing['addOns'] as $addon) {
                DB::table('add_ons')->updateOrInsert(
                    ['code' => $addon['id']],
                    [
                        'label' => $addon['label'],
                        'price_type' => $addon['type'],
                        'unit_price' => $addon['price'],
                        'price_status' => $addon['priceStatus'],
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );

                $addonId = DB::table('add_ons')
                    ->where('code', $addon['id'])
                    ->value('id');

                DB::table('add_on_occasions')
                    ->where('add_on_id', $addonId)
                    ->delete();

                foreach ($addon['occasions'] ?? [] as $occasion) {
                    DB::table('add_on_occasions')->insert([
                        'add_on_id' => $addonId,
                        'occasion' => $occasion,
                    ]);
                }
            }

            /*
             * 6. Tray categories and tray products
             */
            foreach ($pricing['trays'] as $category => $price) {
                $code = strtolower($category);

                DB::table('tray_categories')->updateOrInsert(
                    ['code' => $code],
                    [
                        'name' => ucfirst($category),   
                        'price_per_tray' => $price,
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }

            foreach ($trays as $tray) {
                $categoryCode = strtolower($tray['category']);

                $categoryId = DB::table('tray_categories')
                    ->where('code', $categoryCode)
                    ->value('id');

                if (!$categoryId) {
                    throw new RuntimeException(
                        "Unknown tray category: {$tray['category']}"
                    );
                }

                DB::table('trays')->updateOrInsert(
                    ['code' => $tray['id']],
                    [
                        'tray_category_id' => $categoryId,
                        'name' => $tray['name'],
                        'description' => $tray['description'] ?? null,
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }

            /*
             * 7. Preserve additional configuration and metadata
             */
            $settings = [
                'pricing_rules' => $pricing,
                'package_presentation' => $packages,
                'occasions' => $occasions,
                'dish_menu_metadata' => $menu,
                'addon_metadata' => $pricing['addOns'],
                'tray_metadata' => $trays,
            ];

            foreach ($settings as $key => $value) {
                DB::table('system_settings')->updateOrInsert(
                    ['setting_key' => $key],
                    [
                        'setting_value' => json_encode(
                            $value,
                            JSON_UNESCAPED_UNICODE |
                            JSON_UNESCAPED_SLASHES |
                            JSON_THROW_ON_ERROR
                        ),
                        'value_type' => 'json',
                        'description' => 'Imported catalog configuration: ' . $key,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        });

        $this->command?->info('TIKIM catalog imported successfully.');
    }

    private function readJson(string $filename): array
    {
        $path = public_path('data/' . $filename);

        if (!File::exists($path)) {
            throw new RuntimeException("Missing catalog file: {$filename}");
        }

        $data = json_decode(
            File::get($path),
            true,
            512,
            JSON_THROW_ON_ERROR
        );

        if (!is_array($data)) {
            throw new RuntimeException("Invalid JSON catalog file: {$filename}");
        }

        return $data;
    }
}
