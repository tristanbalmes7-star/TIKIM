<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DateLock extends Model
{
    protected $fillable = [
        'event_date',
        'lock_type',
        'booking_id',
        'hold_id',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'event_date' => 'date',
            'expires_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function hold(): BelongsTo
    {
        return $this->belongsTo(Hold::class);
    }
}
