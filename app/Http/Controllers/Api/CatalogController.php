<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class CatalogController extends Controller
{
    public function index(): JsonResponse
    {
        // Event packages with inclusions
        $eventPackages = DB::table('event_packages')
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->map(function ($package) {
                $package->inclusions = DB::table('event_package_inclusions')
                    ->where('event_package_id', $package->id)
                    ->orderBy('sort_order')
                    ->pluck('label')
                    ->toArray();

                return $package;
            });

        // Food packages
        $foodPackages = DB::table('food_packages')
            ->where('is_active', true)
            ->orderBy('level')
            ->get()
            ->map(function ($package) {
                $package->slot_rules = json_decode($package->slot_rules, true);
                return $package;
            });

        // Dish categories
        $categories = DB::table('dish_categories')
            ->orderBy('sort_order')
            ->get();

        // Dishes
        $dishes = DB::table('dishes')
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->map(function ($dish) use ($categories) {
                $category = $categories->firstWhere('id', $dish->dish_category_id);
                $dish->category = $category?->name;
                return $dish;
            });

        // Add-ons
        $addOns = DB::table('add_ons')
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->map(function ($addon) {
                $addon->occasions = DB::table('add_on_occasions')
                    ->where('add_on_id', $addon->id)
                    ->pluck('occasion')
                    ->toArray();

                return $addon;
            });

        // Tray categories
        $trayCategories = DB::table('tray_categories')
            ->where('is_active', true)
            ->orderBy('id')
            ->get();

        // Trays
        $trays = DB::table('trays')
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->map(function ($tray) use ($trayCategories) {
                $category = $trayCategories->firstWhere('id', $tray->tray_category_id);
                $tray->category = $category?->name;
                $tray->price = $category
                    ? (float) $category->price_per_tray
                    : null;

                return $tray;
            });

        // System settings
        $settings = DB::table('system_settings')
            ->pluck('setting_value', 'setting_key');

        $decodeSetting = function ($key) use ($settings) {
            $value = $settings[$key] ?? null;
            return $value !== null ? json_decode($value, true) : null;
        };

        return response()->json([
            'success' => true,
            'data' => [
                'eventPackages' => $eventPackages,
                'foodPackages' => $foodPackages,
                'categories' => $categories,
                'dishes' => $dishes,
                'addOns' => $addOns,
                'trayCategories' => $trayCategories,
                'trays' => $trays,
                'pricing' => $decodeSetting('pricing_rules'),
                'packagePresentation' => $decodeSetting('package_presentation'),
                'dishMetadata' => $decodeSetting('dish_menu_metadata'),
                'addonMetadata' => $decodeSetting('addon_metadata'),
                'trayMetadata' => $decodeSetting('tray_metadata'),
                'occasions' => $decodeSetting('occasions'),
            ],
        ]);
    }
}