<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Hold extends Model
{
    protected $fillable = [
        'session_token',
        'event_date',
        'status',
        'expires_at',
        'released_at',
        'booking_id',
    ];

    protected function casts(): array
    {
        return [
            'event_date' => 'date',
            'expires_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function dateLock(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(DateLock::class);
    }
}
