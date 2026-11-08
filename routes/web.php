<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\OrganizerAuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\PaymentController;

// Display the original TIKIM homepage.
Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

// Organizer authentication
Route::prefix('api/v1')->group(function () {
    Route::get('/availability', [BookingController::class, 'availability']);
    Route::post('/bookings', [BookingController::class, 'store']);
    Route::post('/bookings/lookup', [BookingController::class, 'lookup'])
        ->middleware('throttle:5,1');
    Route::get('/bookings/{reference}', [BookingController::class, 'showVerified']);
    Route::post('/bookings/{reference}/payments', [PaymentController::class, 'store'])
        ->middleware('throttle:10,1');

    // Public catalog API
    Route::get('/catalog', [CatalogController::class, 'index']);
    // Customer date holds
    Route::post('/holds', [BookingController::class, 'storeHold']);
    Route::get('/holds/active', [BookingController::class, 'activeHold']);
    Route::delete('/holds/active', [BookingController::class, 'releaseHold']);

    // Initialize the CSRF cookie before login.
    Route::get('/csrf', function () {
        return response()->json([
            'token' => csrf_token(),
        ]);
    });

    Route::post('/login', [OrganizerAuthController::class, 'login'])
        ->middleware('throttle:5,1');

    Route::post('/logout', [OrganizerAuthController::class, 'logout'])
        ->middleware('auth');

    Route::get('/me', [OrganizerAuthController::class, 'me'])
        ->middleware('auth');

    Route::middleware('auth')->prefix('admin')->group(function () {
        Route::get('/bookings', [BookingController::class, 'adminIndex']);
        Route::post('/bookings/manual/preview', [BookingController::class, 'previewAdminManual']);
        Route::post('/bookings/manual', [BookingController::class, 'createAdminManual']);
        Route::get('/bookings/{booking}/quote', [BookingController::class, 'showAdminQuote']);
        Route::patch('/bookings/{booking}/quote', [BookingController::class, 'updateAdminQuote']);
        Route::patch('/bookings/{booking}/status', [BookingController::class, 'updateAdminStatus']);
        Route::get('/payments/pending', [PaymentController::class, 'pending']);
        Route::get('/payment-receipts/{receipt}', [PaymentController::class, 'receipt']);
        Route::post('/payments/{payment}/approve', [PaymentController::class, 'approve']);
        Route::post('/payments/{payment}/reject', [PaymentController::class, 'reject']);
    });
});