---
schema: nighty.task/v1
task_id: TASK-003
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-001, TASK-002]
requirements: [PRODUCTION-PLAN-TASK-003]
created_by: codex
created_at: 2026-11-14T21:30:00+04:00
---

# Establish the typed Nighty API contract

## Objective

Create validated Nest DTOs, a reproducible OpenAPI document, and generated frontend contract types for every approved V1 capability before endpoint implementation.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 3
- docs/approved/PRODUCT_DESIGN.md
- docs/approved/STRUCTURED_ACTIONS.md
- AGENTS.md

## Dependencies

TASK-001 workspace and TASK-002 stable domain enums and owners.

## In scope

- Exact request and response DTOs for authentication, users, shifts, canvas, entries, handover, tags, uploads, search, settings, and audit.
- Global whitelist validation with unknown-field rejection.
- OpenAPI document generation with stable operation IDs and component schemas.
- Deterministic generated TypeScript types consumed by the browser workspace.
- Contract and generation-cleanliness tests.

## Out of scope

- Endpoint business logic, authentication persistence, UI, deployment, merge, and push.

## Implementation instructions

- Observe contract tests failing before DTO and OpenAPI implementation.
- Reuse stable enum values from the approved domain.
- Reject unknown request fields.
- Do not hand-maintain browser payload types outside the generator.

## Expected files/modules

- apps/api/src/common/dto, apps/api/src/openapi.ts, generation scripts, packages/api-client generated source and tests

## Technical and security restrictions

- No permissive unknown fields.
- No endpoint may accept a broader payload than documented.
- Generated output must be deterministic and diff-clean.

## Required tests and exact commands

- npm run test:contract -w @nighty/api
- npm run api:generate
- npm test -w @nighty/api-client
- npm run check
- npm run build --workspaces --if-present
- git diff --check

## Acceptance criteria

- All approved V1 contract areas have named component schemas.
- Unknown fields fail validation.
- Generated frontend types compile and regenerate without a diff.
- Full repository verification remains green.

## Required delivery report

Create docs/implementation/TASK-003-CHECKPOINT.md with exact evidence. Do not label direct Codex work as a DeepSeek delivery.
