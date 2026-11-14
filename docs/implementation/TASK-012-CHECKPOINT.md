# TASK-012 access experience checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 23370e1

## Outcome

Nighty now has a real API-backed login and session shell, explicit 30-minute expiry recovery, administrator-only Settings navigation, sign out, and a responsive Profile/password panel. HTTP-only session cookies remain server-owned; the browser keeps only the current CSRF value in memory.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Verification

- `npm test -w @nighty/web -- auth profile` -> exit 0, 3 focused tests passed.
- `npm run typecheck -w @nighty/web` -> exit 0.
- Production web build and consolidated rendered-browser verification are recorded before final delivery.

## Review findings

1. Valid and invalid access states, password visibility, session restoration, expiry, and role-aware navigation are explicit.
2. Mutations include the rotated CSRF token while the session remains an HTTP-only cookie.
3. The Profile panel exposes account facts, display-name editing, and minimum/matching password validation.
4. Semantic form labels, status/alert regions, visible focus, and responsive login/shell layouts are present.
5. Typography is sans-serif throughout.
