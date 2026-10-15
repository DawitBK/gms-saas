# Authentication & Identity Module

This module manages the security perimeter of the GMS Enterprise system. It handles identity verification, session lifecycle, and Role-Based Access Control (RBAC).

## Key Features

- **Multi-Factor Authentication (MFA)**: OTP-based 2FA via email.
- **Session Management**: JWT-based access tokens with secure, HTTP-only refresh tokens.
- **Self-Healing Admin**: Automatic provisioning of the bootstrap super-admin account (`admin@examplecorp.net`).
- **CSRF Protection**: Token-based validation for all state-changing requests.
- **Identity OCR**: Integration with OCR services for guest ID verification during registration.

## Architecture

- **AuthService**: Business logic for login, registration, and token rotation.
- **AuthRepository**: Database interactions for users, roles, and sessions.
- **Middleware**:
  - `requireAuth`: Enforces valid JWT access.
  - `requireCsrf`: Validates the X-CSRF-Token header.
  - `rateLimiter`: Protects against brute-force and credential stuffing.

## Security Protocols

1. **Password Hashing**: Argon2/Bcrypt with cost factor 12.
2. **Token Lifecycle**:
   - Access Token: 1 hour (Memory only).
   - Refresh Token: 7 days (Secure Cookie).
3. **Logout**: Revokes session in DB and clears client-side cookies.

## API Endpoints

- `POST /auth/login`: Authenticate and start session.
- `POST /auth/logout`: Terminate session.
- `GET /auth/me`: Validate session and retrieve profile.
- `POST /auth/verify-2fa`: Complete MFA challenge.
