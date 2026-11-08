<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingLayout extends Model
{
    protected $fillable = [
        'booking_id',
        'layout_name',
        'layout_data',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'layout_data' => 'array',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }
}
