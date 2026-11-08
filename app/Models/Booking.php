<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Booking extends Model
{
    protected $fillable = [
        'reference',
        'booking_type',
        'status',
        'customer_name',
        'customer_email',
        'customer_mobile',
        'event_date',
        'occasion',
        'guest_count',
        'preferred_start_time',
        'preferred_end_time',
        'venue_type',
        'venue_address',
        'city',
        'fulfillment_type',
        'delivery_notes',
        'customer_notes',
        'admin_notes',
        'subtotal',
        'discount',
        'total_amount',
        'downpayment_amount',
        'amount_paid',
        'balance_amount',
        'pricing_snapshot',
        'hold_expires_at',
        'confirmed_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'event_date' => 'date',
            'pricing_snapshot' => 'array',
            'hold_expires_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'completed_at' => 'datetime',
            'subtotal' => 'integer',
            'discount' => 'integer',
            'total_amount' => 'integer',
            'downpayment_amount' => 'integer',
            'amount_paid' => 'integer',
            'balance_amount' => 'integer',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(BookingItem::class);
    }

    public function menuPicks(): HasMany
    {
        return $this->hasMany(BookingMenuPick::class);
    }

    public function addOns(): HasMany
    {
        return $this->hasMany(BookingAddOn::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function hold(): HasMany
    {
        return $this->hasMany(Hold::class);
    }

    public function dateLock(): HasOne
    {
        return $this->hasOne(DateLock::class);
    }

    public function layout(): HasOne
    {
        return $this->hasOne(BookingLayout::class);
    }
}
