<?php

namespace App\Console\Commands;

use App\Models\Booking;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ExpireUnpaidBookings extends Command
{
    protected $signature = 'bookings:expire-unpaid';

    protected $description = 'Expire Event and Food bookings whose unpaid 48-hour hold has elapsed';

    public function handle(): int
    {
        $now = now();
        $expiredCount = 0;

        Booking::query()
            ->whereIn('booking_type', ['event', 'food'])
            ->where('status', 'Hold (48 Hours)')
            ->whereNotNull('hold_expires_at')
            ->where('hold_expires_at', '<=', $now)
            ->select('id')
            ->orderBy('id')
            ->chunkById(100, function ($bookings) use (&$expiredCount): void {
                foreach ($bookings as $candidate) {
                    $expired = DB::transaction(function () use ($candidate): bool {
                        $booking = Booking::query()
                            ->lockForUpdate()
                            ->find($candidate->id);

                        if (
                            !$booking ||
                            !in_array($booking->booking_type, ['event', 'food'], true) ||
                            $booking->status !== 'Hold (48 Hours)' ||
                            !$booking->hold_expires_at ||
                            $booking->hold_expires_at->isFuture()
                        ) {
                            return false;
                        }

                        $payments = $booking->payments()
                            ->lockForUpdate()
                            ->get(['amount', 'status', 'submitted_at']);

                        $approvedAmount = $payments
                            ->where('status', 'Approved')
                            ->sum('amount');

                        if ($approvedAmount >= (int) $booking->downpayment_amount) {
                            return false;
                        }

                        $hasTimelyPendingPayment = $payments->contains(
                            fn ($payment): bool => $payment->status === 'Pending Verification'
                                && $payment->submitted_at !== null
                                && $payment->submitted_at->lte($booking->hold_expires_at)
                        );

                        if ($hasTimelyPendingPayment) {
                            return false;
                        }

                        $booking->status = 'Expired';
                        $booking->save();

                        $booking->dateLock()
                            ->where('lock_type', 'booking')
                            ->where('booking_id', $booking->id)
                            ->delete();

                        return true;
                    });

                    if ($expired) {
                        $expiredCount++;
                    }
                }
            });

        $this->info("Expired {$expiredCount} unpaid booking(s).");
        Log::info('Expired unpaid bookings.', ['expired_count' => $expiredCount]);

        return self::SUCCESS;
    }
}
