<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingMenuPick extends Model
{
    protected $fillable = [
        'booking_id',
        'dish_id',
        'dish_name',
        'category_name',
        'selection_group',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }
}
