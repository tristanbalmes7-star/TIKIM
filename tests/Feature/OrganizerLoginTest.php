<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrganizerLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_csrf_endpoint_returns_the_token_for_its_session(): void
    {
        $response = $this->getJson('/api/v1/csrf')
            ->assertOk()
            ->assertJsonStructure(['token']);

        $this->assertNotEmpty($response->json('token'));
        $response->assertSessionHas('_token', $response->json('token'));
        $response->assertCookie(config('session.cookie'));
    }

    public function test_invalid_credentials_are_rejected_after_fetching_session_token(): void
    {
        $csrfResponse = $this->getJson('/api/v1/csrf')->assertOk();
        $token = $csrfResponse->json('token');

        $csrfResponse->assertSessionHas('_token', $token);

        $this->postJson('/api/v1/login', [
            'username' => 'unknown-organizer',
            'password' => 'incorrect-password',
        ], [
            'X-CSRF-TOKEN' => $token,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('username');
    }

    public function test_valid_credentials_authenticate_after_fetching_session_token(): void
    {
        User::factory()->create([
            'name' => 'Organizer',
            'username' => 'login-organizer',
            'role' => 'Event Coordinator',
            'password' => Hash::make('correct-password'),
        ]);

        $csrfResponse = $this->getJson('/api/v1/csrf')->assertOk();
        $token = $csrfResponse->json('token');
        $csrfResponse->assertSessionHas('_token', $token);

        $response = $this->postJson('/api/v1/login', [
            'username' => 'login-organizer',
            'password' => 'correct-password',
        ], [
            'X-CSRF-TOKEN' => $token,
        ])->assertOk()
            ->assertJsonPath('message', 'Login successful.')
            ->assertJsonPath('user.username', 'login-organizer');
        $this->assertAuthenticatedAs(User::where('username', 'login-organizer')->firstOrFail());
        $this->assertAuthenticatedAs(User::where('username', 'login-organizer')->firstOrFail());
    }
}
