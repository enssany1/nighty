---
schema: nighty.task/v1
task_id: TASK-002
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-001]
requirements: [PRODUCTION-PLAN-TASK-002]
created_by: codex
created_at: 2026-11-14T21:15:00+04:00
---

# Define Nighty persistence ownership

## Objective

Define the PostgreSQL and Prisma persistence model, initial migration, database-level ownership constraints, generated client boundary, and deterministic development seed for the approved single-team Nighty domain.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 2
- docs/approved/PRODUCT_DESIGN.md
- docs/approved/STRUCTURED_ACTIONS.md
- AGENTS.md

## Dependencies

TASK-001 production workspaces and local PostgreSQL Compose service.

## In scope

- Prisma 7 schema and generated client for all approved V1 entities and stable enums.
- Initial SQL migration with constraints Prisma cannot express.
- Nest-owned Prisma service using the PostgreSQL driver adapter.
- Deterministic development seed with one administrator, three operators, three shifts, assignments, tags, one operational day, representative actions, and settings defaults.
- PostgreSQL integration tests for table ownership, uniqueness, checks, and relationships.

## Out of scope

- Authentication endpoints, business controllers, retention execution, UI, deployment, merge, and push.

## Implementation instructions

- Observe schema integration tests failing before migration.
- Use Prisma 7.10 stable configuration and a pg driver adapter.
- Preserve JSONB editor documents and normalized plain text.
- Store only digests for session tokens.
- Add explicit SQL checks for minute ranges, nonzero shift durations, attachment parent exclusivity, and positive file sizes.

## Expected files/modules

- apps/api/prisma, apps/api/prisma7.config.ts, generated Prisma client, database service, integration tests

## Technical and security restrictions

- Never log or persist a plaintext password or session token.
- Seed defaults are development-only and must stop in production.
- Migration owns database meaning; application code must not duplicate structural checks.

## Required tests and exact commands

- docker compose up -d postgres
- npm run prisma:setup:test -w @nighty/api
- npm run test:integration -w @nighty/api -- schema.integration-spec.ts
- npm run check
- npm run build --workspaces --if-present
- git diff --check

## Acceptance criteria

- Clean migration and seed succeed against local PostgreSQL.
- Required models and stable enums are generated.
- Unique username, tag name, shift ordering, and session digest constraints hold.
- Exactly one attachment parent is enforced by PostgreSQL.
- Historical shift instance relationships cannot be silently orphaned.
- Full repository verification remains green.

## Required delivery report

Create docs/implementation/TASK-002-CHECKPOINT.md with exact test evidence and limitations. This direct Codex task must not be labeled as a DeepSeek delivery.
