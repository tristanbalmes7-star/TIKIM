<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class OrganizerSeeder extends Seeder
{
    public function run(): void
    {
        $name = env('ORGANIZER_NAME');
        $username = env('ORGANIZER_USERNAME');
        $password = env('ORGANIZER_PASSWORD');

        if (!$name || !$username || !$password) {
            throw new RuntimeException(
                'Organizer credentials are missing from the .env file.'
            );
        }

        User::updateOrCreate(
            ['username' => $username],
            [
                'name' => $name,
                'email' => 'organizer@tikim.local',
                'role' => 'Event Coordinator',
                'password' => $password,
            ]
        );
    }
}
