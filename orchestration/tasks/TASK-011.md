---
schema: nighty.task/v1
task_id: TASK-011
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-010]
requirements: [PRODUCTION-PLAN-TASK-011]
created_by: codex
created_at: 2026-11-15T00:00:00+04:00
---

# Add search and retention lifecycle

## Objective

Implement indexed, filtered, deterministic entry search and two-phase permanent deletion that retains failed file ownership for retry.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 11
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

TASK-007 stable plain text, TASK-009 owned files, and TASK-010 typed retention setting/audit.

## In scope

- Text/date/operator/shift/tag/type/Follow-status filters and bounded cursor paging.
- Retention preview, mark, owned-file cleanup, finalize, partial failure, retry, and audit summary.
- PostgreSQL text/date search indexes.

## Out of scope

Scheduled background execution, browser UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- search retention
- npm run test:integration -w @nighty/api -- retention.failure-spec.ts

## Acceptance criteria

- Search uses server-owned plain text and stable destination identities.
- Date ranges are inclusive and pagination deterministic/bounded.
- Retention marks before file deletion and finalizes database deletion only after all owned files are absent/deleted.
- Failed file deletion retains the parent and ownership for retry; repeated cleanup is idempotent.
- Preview is dry-run and the strict older-than cutoff honors the one-year default.

## Required delivery report

Create docs/implementation/TASK-011-CHECKPOINT.md with exact evidence.
