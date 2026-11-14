# TASK-004 secure session authentication checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 8243825

## Outcome

Nighty now has Argon2id authentication, opaque server-side sessions, 30-minute sliding inactivity expiry, CSRF protection, and ADMIN/OPERATOR route authorization. Login, current-session refresh, logout, and password-change endpoints are wired through global fail-closed guards.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the focused unit suite failed because `AuthService` did not exist, and the approved end-to-end script was absent.
- GREEN: four focused unit tests and two real PostgreSQL end-to-end tests pass.

## Security ownership

- Session and CSRF secrets contain 256 random bits and only SHA-256 digests are persisted.
- Login rotates existing sessions for that user inside the same transaction as new-session creation.
- Session authentication checks revocation, account status, absolute stored expiry, and the 30-minute last-activity boundary before extending activity.
- Expired sessions are revoked and never extended.
- Unsafe authenticated methods require the current per-session CSRF header.
- `HttpOnly`, `SameSite=Lax`, root path, bounded max-age, and production `Secure` cookie flags are controller-owned and tested.
- Global session, CSRF, and role guards default to protection; public routes require explicit metadata.

## Verification

- `npm test -w @nighty/api -- auth` -> exit 0, 4 passed.
- `npm run test:e2e -w @nighty/api -- auth.e2e-spec.ts` -> exit 0, 2 passed against PostgreSQL.
- `npm run test:contract -w @nighty/api` -> exit 0, 3 passed.
- `npm test -w @nighty/api-client` -> exit 0, generated types current.
- Full repository verification, build, image build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Invalid username, invalid password, and disabled account use the same public response while password work is still performed for unknown users.
2. CSRF values are rotated when the browser restores a session through `GET /api/auth/me`.
3. Password changes revoke every active session and clear the caller's session cookie.
4. Operators are rejected from ADMIN-only handlers even with a valid session; administrators are admitted.
5. OpenAPI generation overrides the database provider, so contract generation remains deterministic and does not connect to a live database.

## Limitations

User administration and profile endpoints are owned by TASK-005. Audit-event emission for authenticated mutations is introduced with the owning administration and business services.
