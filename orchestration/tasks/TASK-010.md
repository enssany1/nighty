---
schema: nighty.task/v1
task_id: TASK-010
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-009]
requirements: [PRODUCTION-PLAN-TASK-010]
created_by: codex
created_at: 2026-11-14T23:30:00+04:00
---

# Add typed Settings and immutable Audit

## Objective

Provide named, typed General/Security/Retention settings and filtered immutable Audit reads for administrators.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 10
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

TASK-004 administrator authorization and existing mutation audit records.

## In scope

- Asia/Muscat, 24-hour, 30-minute timeout, and one-year retention defaults.
- Typed settings mutation with before/after audit evidence.
- Actor/request/session metadata on centralized audit writes.
- Filtered newest-first audit reads; no audit mutation routes.

## Out of scope

Retention deletion, search, Settings UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- settings audit
- npm run test:e2e -w @nighty/api -- audit.e2e-spec.ts

## Acceptance criteria

- Consumers receive typed named settings rather than raw keys.
- Settings are ADMIN-only and validated.
- Settings mutations atomically create immutable before/after audit events with request/session metadata.
- Audit filters work and mutation endpoints do not exist.

## Required delivery report

Create docs/implementation/TASK-010-CHECKPOINT.md with exact evidence.
