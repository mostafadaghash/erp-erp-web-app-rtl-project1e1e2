# Phase 05.01 — Authentication Gap Analysis

**Status:** CLOSED  
**Branch:** `agent/postgres-v1.7-core`  
**Starting SHA:** `bbccbfccd30e5797e9434b1880241429108233ad`

## Official contract

Architecture Baseline v1.7 and the Master Implementation Plan require backend-owned authentication for the Local Core with:

- password hashes only;
- revocable sessions;
- refresh-token hashes only;
- secure cookie/token transport selected by deployment mode;
- login rate limiting;
- disabled-account enforcement in the backend;
- Authentication enforced in the Central Backend rather than trusted from UI state;
- remote/WAN deployment over TLS/HTTPS or another secure tunnel.

The approved physical model already contains `users.password_hash` and `auth_sessions(id,user_id,refresh_token_hash,device_name,ip_address,expires_at,revoked_at,created_at)`.

## Gap classification

| Area | Current state | 05.01 action |
| --- | --- | --- |
| `users.password_hash` | موجود ومتوافق | reuse |
| `auth_sessions` | موجود ومتوافق | reuse |
| case-insensitive username/email indexes | موجودة ومتوافقة | reuse |
| unique refresh-token hash + session lookup index | موجودان ومتوافقان | reuse |
| backend password hashing/verifier | غير موجود | implement Scrypt |
| login/session API | غير موجود | implement |
| refresh token hashing/rotation | غير موجود | implement |
| access-token validation | غير موجود | implement |
| session revocation/logout | غير موجود | implement |
| account-disabled enforcement | غير موجود | implement |
| login rate limiting | غير موجود | implement |
| secure refresh-cookie transport | غير موجود | implement |
| frontend Convex Auth cutover | later official phase | intentionally not started |

## Implementation decisions

1. No migration and no new index. The frozen V1 schema/index catalog already supports Authentication.
2. Passwords use Node.js Scrypt with a random per-password salt; plaintext passwords are never stored.
3. Refresh tokens are 32 random bytes and only SHA-256 hashes are stored in `auth_sessions`.
4. Access tokens are short-lived signed session tokens. Their HMAC combines a server-only signing secret with the current refresh-token hash, so database read access alone cannot forge a token and refresh rotation invalidates older access tokens.
5. Access-token authentication rechecks the PostgreSQL session row and user `is_active`; revoked, expired, or disabled sessions are rejected by the backend.
6. Refresh is rotating and serialized with `FOR UPDATE`; the old refresh token stops working after a successful rotation.
7. Login rechecks the user under `FOR UPDATE` before creating the session, so a concurrent password change/disable cannot create a stale authenticated session.
8. Unknown username and bad password use the same public error `AUTH_INVALID_CREDENTIALS`; unknown-user attempts still consume Scrypt work to reduce account-enumeration timing differences.
9. Login attempts are bounded in-process by normalized identifier + source IP. This is the V1 single-central-backend operational limiter; distributed/shared durable throttling is not introduced outside the frozen schema.
10. Refresh token transport is an `HttpOnly; SameSite=Strict; Path=/auth` cookie. Deployment mode `https` adds `Secure`; `local-http` is only for local/trusted LAN deployment. WAN/external deployment must use the HTTPS mode in accordance with the Architecture Baseline.
11. The API returns the short-lived access token but never returns the refresh token in JSON.
12. Frontend cutover remains explicitly out of scope here to preserve Single Write/Runtime ownership sequencing.

## API surface

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Public failures use stable codes such as `AUTH_INVALID_CREDENTIALS`, `AUTH_RATE_LIMITED`, `AUTH_SESSION_INVALID`, `AUTH_SESSION_EXPIRED`, and `AUTH_ACCOUNT_DISABLED`.

## Executable evidence

- `server/tests/authentication.test.ts`: Scrypt, token signing/tamper/expiry, refresh hashing, cookie transport, and rate limiter.
- `server/tests/authentication.integration.test.mjs`: PostgreSQL 17 API-level login, plaintext absence, session persistence, refresh rotation, old-token invalidation, disabled-account enforcement, logout revocation, rate limiting, and frozen auth index inventory.
- explicit PostgreSQL 17 Authentication CI gate.

## Non-goals

- No 05.02 Roles.
- No 05.03 Effective Permissions.
- No 05.04 Branch Scope.
- No frontend Auth cutover/removal of Convex Runtime.
- No Convex Production change.
- No merge to `main`.

## Validation evidence

- Verified implementation SHA: `3558211d6db2dcac1a00c52b92747268fa17ebfd`.
- Full implementation CI: Run `#962` / `35415190981` — SUCCESS.
- Backend secret/security scan: SUCCESS.
- Backend TypeScript and unit tests: SUCCESS.
- Scrypt password hash/no-plaintext proof: SUCCESS.
- refresh token SHA-256 persistence and no refresh token in JSON: SUCCESS.
- access-token server-secret signature/tamper/expiry proof: SUCCESS.
- API login by case-insensitive username/email: SUCCESS.
- refresh rotation invalidates old refresh and access token: SUCCESS.
- disabled-account enforcement and session revocation: SUCCESS.
- logout revocation: SUCCESS.
- login rate limit: five isolated invalid attempts followed by a 429-limited attempt: SUCCESS.
- refresh-cookie HttpOnly/SameSite=Strict and HTTPS Secure-mode behavior: SUCCESS.
- frozen `auth_sessions` index inventory: SUCCESS.
- migrations verify-only: SUCCESS; no migration/index added.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- Validation PR: `#219` — validation-only; do not merge.
- Final documentation closure SHA must pass Full CI before PR #219 is closed.

## Diagnostic history

- Run `#959`: security scan correctly rejected literal test-secret assignments.
- Run `#960`: security scan passed; Backend TypeScript exposed stale test variable names.
- Run `#961`: security/typecheck/unit passed; Authentication integration exposed a rate-limit test isolation issue caused by an earlier disabled-login failure sharing the same limiter key.
- These were corrected without weakening product security or the security scanner. Run `#962` passed fully.

## Next action

After final same-SHA closure validation succeeds: `PHASE 05 / 05.02 Roles` only.
