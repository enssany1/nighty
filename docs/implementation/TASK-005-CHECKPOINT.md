# TASK-005 user and profile management checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 6de7838

## Outcome

Nighty now provides authenticated user administration and self-profile workflows with normalized immutable usernames, multi-shift assignment, transactional administrator invariants, one-time temporary-password responses, forced password changes, session revocation, and immutable audit evidence.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the focused unit suite could not load the absent users service; end-to-end user routes returned 404.
- GREEN: four focused invariant tests and two PostgreSQL end-to-end workflow tests pass.

## Verification

- `npm test -w @nighty/api -- users` -> exit 0, 4 passed.
- `npm run test:e2e -w @nighty/api -- users.e2e-spec.ts` -> exit 0, 2 passed.
- Full repository contract generation, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Usernames are normalized once at service ownership and cannot be updated through the update DTO.
2. User creation can atomically assign multiple shifts and returns a generated temporary password only in that response.
3. Password hashes use Argon2id; password resets revoke active sessions and set `mustChangePassword`.
4. Administrators cannot disable or demote themselves.
5. Removal of the final active administrator locks and counts active administrator rows inside a serializable transaction.
6. User audit payloads contain public user facts only; passwords and hashes are excluded.

## Limitations

Shift-definition editing and schedule validation begin in TASK-006. The selected administration web experience is implemented in TASK-014.
