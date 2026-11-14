# TASK-010 typed Settings and immutable Audit checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 7eef596

## Outcome

Nighty now exposes named typed General, Security, and Retention settings to administrators and provides immutable filtered Audit reads with before/after facts plus request/session metadata.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the typed Settings owner did not exist and Settings/Audit endpoints returned 404.
- GREEN: two focused type/default tests and two PostgreSQL authorization/audit workflows pass.

## Verification

- Additive `AuditEvent.metadata` migration deployed and missing settings defaults seeded idempotently.
- `npm test -w @nighty/api -- settings audit` -> exit 0, 2 passed.
- `npm run test:e2e -w @nighty/api -- audit.e2e-spec.ts` -> exit 0, 2 passed.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Consumers receive named typed sections; raw AppSetting JSON is parsed once at the Settings owner.
2. Approved defaults are Nighty, Shift Operations Handover, Asia/Muscat, 24-hour time, current operational day, 30-minute timeout, 12-character password minimum, and 365-day retention.
3. Persisted type drift fails instead of being coerced.
4. Settings reads/mutations are ADMIN-only and mutations write before/after audit evidence in the same transaction.
5. Centralized audit writes can retain bounded request ID, session ID, IP, and user-agent metadata without credentials.
6. Audit reads filter by actor, action, area, and date and order newest-first; no update/delete route exists.

## Limitations

Previously created audit events legitimately lack request metadata. Search and permanent retention deletion begin in TASK-011.
