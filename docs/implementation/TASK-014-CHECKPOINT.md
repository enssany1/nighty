# TASK-014 administration workspace checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** bcaeaa4

## Outcome

Nighty now has the selected Option 2 administration experience with its own sidebar and Back to operations. Seven sections cover General, Users, Shifts, Tags, Security, Retention, and Audit with tables/lists, inspectors, confirmations, responsive stacking, and real API mutations.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Verification

- `npm test -w @nighty/web -- settings` -> exit 0, 2 focused tests passed.
- Full frontend suite -> exit 0, 10 tests passed.
- Frontend typecheck and production build -> exit 0.
- Consolidated administrator browser journey is recorded in TASK-015 before delivery.

## Review findings

1. Users supports create/edit/status/role/multiple-shift assignment and one-time reset password presentation; server last-admin/self safeguards remain authoritative.
2. Shifts show explicit overlap permission and leave full 24-hour gap validation to the atomic server schedule owner.
3. Reorders send complete identities; Tag deletion surfaces the server's archive-instead recovery when in use.
4. Security keeps the approved fixed 30-minute session timeout while exposing password minimum policy.
5. Retention requires preview and a separate destructive confirmation; deletion results include failure counts.
6. Audit is read-only, filterable, and displays before/after/request evidence in the inspector.
7. Desktop uses a right inspector and narrow screens stack it full width; typography remains sans-serif.
