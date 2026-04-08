# Multi-User Auth And Data Isolation Design

## Status
Validated on 2026-04-08 through collaborative design review.

## Goal
Add first-version multi-user support to PixelReel with:

- Email + password authentication
- One private library per account
- HttpOnly cookie session auth
- Minimal account lifecycle: register, login, logout, current user

This design explicitly does not include:

- Third-party login
- Password reset
- Email verification
- Public profiles
- Shared or family libraries
- Team or tenant abstractions

## Confirmed Decisions

### Product Scope
- Authentication method: email + password
- Library ownership model: each account only sees its own records
- Account creation: open registration
- Session model: HttpOnly cookie session
- First-version account features: register, login, logout, me

### Recommended Technical Direction
Use Spring Security with HttpSession and per-record ownership via `owner_user_id`.

Rejected alternatives:

1. Custom interceptor + manual session handling
   Faster initially, but weaker on security defaults and more likely to create rework.
2. Full unified library-record refactor
   Cleaner long-term model, but too large for the current stage and unnecessary for the immediate goal.

## Architecture

### Core Model
Keep the existing `movie` and `game` tables. Introduce one new `user` table and attach ownership to existing content tables.

New `user` table fields:

- `id`
- `email`
- `password_hash`
- `display_name`
- `created_at`
- `updated_at`

Constraints:

- `email` must be unique
- password is stored only as a BCrypt hash

Existing tables gain:

- `movie.owner_user_id`
- `game.owner_user_id`

Both ownership fields must be indexed. After migration is complete, both should be non-null.

### Auth Flow
Authentication uses Spring Security and server-side session storage.

- `POST /api/auth/register`
  Creates a user and establishes a login session immediately.
- `POST /api/auth/login`
  Verifies email and password, then establishes a login session.
- `POST /api/auth/logout`
  Invalidates the current session.
- `GET /api/auth/me`
  Returns the current authenticated user's basic profile.

The browser stores only the session cookie. Frontend code does not manage bearer tokens.

### Authorization Boundary
Protected APIs must derive the current user from the authenticated session, never from a client-provided `userId`.

Protected by default:

- `/api/profile/**`
- `/api/library/**`
- import endpoints
- any future record create/update/delete endpoints

Search endpoints can remain a separate decision, but all personal data endpoints require authentication.

## Backend Design

### Security Layer
Add a dedicated `SecurityConfig` that:

- permits the auth endpoints
- requires authentication for personal data endpoints
- configures session-based login state
- uses BCrypt password encoding

### Auth Components
Add:

- `AuthController`
- `AuthService`
- `CurrentUserService`
- `User` entity
- `UserMapper`

Responsibilities:

- `AuthController` exposes auth endpoints
- `AuthService` handles registration, login, logout behavior, and password verification
- `CurrentUserService` resolves the current authenticated user or user ID for business services
- `UserMapper` supports lookup by ID and email

### Business Service Changes
Current services must become ownership-aware.

At minimum:

- `LibraryService`
- `ProfileSummaryService`
- `SteamOwnedGamesImportService`
- `OpenXblImportService`
- `PsnProfilesImportService`
- any movie/game create or update path

Expected changes:

- reads filter by `owner_user_id = currentUserId`
- writes assign `owner_user_id = currentUserId`
- updates verify the target record belongs to the current user before modifying it

The service layer should not accept arbitrary user identifiers from controllers for these flows.

## Frontend Design

### Auth State
Add a lightweight `authStore` responsible for:

- loading `GET /api/auth/me` on app startup
- storing `currentUser`
- tracking `isAuthenticated`
- tracking loading and auth errors
- exposing `login`, `register`, and `logout`

### Routing
Add an `/auth` route for registration and login.

Protect existing routes:

- `/`
- `/movies/search`
- `/games/search`
- `/library`

Unauthenticated users should be redirected to `/auth`. After successful login or registration, the app should return the user to the originally requested route or default to `/`.

### UI Scope
First version keeps account UI minimal:

- one auth page for register/login
- current user display in the shell
- logout action in the shell

Not included in first version:

- profile editing
- avatar upload
- remember me
- account settings area

### Client Data Hygiene
On logout, personal frontend stores must be cleared so one account's library or summary never remains visible for another account.

This includes at least:

- profile summary state
- library state
- any selected record state derived from personal data

## Migration Strategy

### Existing Single-User Data
Because the current system is single-user, historical records may exist without ownership.

Recommended migration:

1. Create the new `user` table.
2. Add nullable `owner_user_id` to `movie` and `game`.
3. Create one default local user for the existing dataset.
4. Backfill all existing records to that user's ID.
5. Add indexes.
6. Tighten to non-null ownership once backfill is complete.

This avoids long-lived orphaned records and preserves existing data.

## Error Handling

Use consistent API behavior:

- unauthenticated access: `401`
- duplicate email on registration: `409`
- invalid email/password: `401`
- malformed request payload: `400`
- access to another user's resource: prefer `404` to avoid exposing resource existence

Frontend behavior:

- redirect to `/auth` on unauthenticated protected-route access
- show inline form errors for auth failures
- show generic error states for unexpected server issues

## Verification Strategy
Minimum validation must cover:

1. Register -> authenticated session established
2. Login -> authenticated session established
3. Logout -> session destroyed
4. Unauthenticated access to protected endpoints returns `401`
5. User A cannot read or update User B records
6. Profile summary only includes the current user's records
7. Imports create records only for the current user
8. Logout clears personal frontend state before another user signs in

If possible during implementation, add backend integration tests for the isolation path even if broader coverage remains limited.

## Implementation Notes

Keep the scope disciplined. The purpose of this milestone is to convert the project from a global single-user dataset into per-account private libraries without destabilizing the current movie/game/product structure.

Do not expand the milestone to include:

- public sharing
- permissions matrixes
- admin consoles
- invitation systems
- collaborative editing

Those can be layered later on top of this ownership model.
