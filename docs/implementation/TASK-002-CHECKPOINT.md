# TASK-002 persistence checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 3d56816

## Outcome

Nighty now has a PostgreSQL-owned V1 domain model, Prisma 7.10 client generation, an initial migration, an idempotent development seed, and a Nest database service using the official pg driver adapter.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the schema integration suite found no owner tables and failed all three initial cases.
- GREEN: four PostgreSQL integration tests now pass across table inventory, uniqueness and check constraints, restrictive historical ownership, and deterministic seed evidence.

## Persistence ownership

The migration owns User, Session, ShiftDefinition, ShiftAssignment, OperationalDay, ShiftInstance, Entry, TodoItem, FollowTransfer, EntryRevision, Tag, EntryTag, TagPost, Attachment, AuditEvent, and AppSetting.

Database checks enforce normalized usernames, digest shapes, session expiry ordering, shift minute bounds, nonzero durations, positive ordering, one active ShiftInstance, lifecycle timestamps, action payload consistency, nonblank To-do rows, Follow completion consistency, tag normalization, positive attachment size, SHA-256 shape, and exactly one attachment parent.

## Verification

- npm run prisma:setup:test -w @nighty/api -> exit 0 twice; migration deployment and seed are idempotent.
- npm run test:integration -w @nighty/api -- schema.integration-spec.ts -> exit 0, 4 passed.
- npm run check -> exit 0; 116 orchestration tests and API/web unit suites pass.
- npm run build --workspaces --if-present -> exit 0.
- docker compose build api -> exit 0.
- npm audit --omit=dev --audit-level=high -> exit 0, zero vulnerabilities.
- Local stack: PostgreSQL and API healthy; API health returns status ok; web returns HTTP 200 at port 8088.

## Review findings

1. Prisma schema and SQL migration agree, while SQL owns constraints Prisma cannot express.
2. Session records persist only token and CSRF digests.
3. Historical ShiftInstance rows retain immutable snapshots and restrict deletion of their definition.
4. Attachment ownership is structurally exclusive in PostgreSQL.
5. Seed password values are Argon2id hashes; plaintext is not persisted or logged.
6. The seed is disabled in production and is idempotent without clearing existing records.
7. Generated Prisma code is reproducible and excluded from Git; build and typecheck generate it automatically.

## Safety deviation

The approved plan named a destructive prisma migrate reset command. Prisma correctly refused that operation in unattended mode. Codex did not bypass the guard. Because the local database was new and empty, verification used non-destructive prisma migrate deploy plus an idempotent seed. No existing database records were deleted.

## Limitations

API authentication and business services are not yet wired to Prisma; those begin in TASK-003 and TASK-004. Production migration orchestration, backup, restore, and retention cleanup remain later tasks.
