---
schema: nighty.task/v1
task_id: TASK-006
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-005]
requirements: [PRODUCTION-PLAN-TASK-006]
created_by: codex
created_at: 2026-11-14T22:15:00+04:00
---

# Add overlapping shift schedules

## Objective

Implement complete circular 24-hour coverage with allowed overlaps and immutable operational-day snapshots.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 6
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

TASK-002 persistence and TASK-005 administrative authorization.

## In scope

- Coverage validation, shift CRUD/reorder, active-name and zero-duration checks.
- Operational-day materialization anchored by the first ordered active shift.
- Immutable definition and assignment snapshots.

## Out of scope

Canvas entries, handover, UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- shift-coverage
- npm run test:e2e -w @nighty/api -- shifts.e2e-spec.ts

## Acceptance criteria

- Overlaps and overnight intervals are accepted.
- Any uncovered minute is rejected with exact ranges.
- Empty/duplicate active names and zero-duration shifts fail.
- Reordering is collision-safe.
- Historical definition and assignment snapshots do not change after schedule edits.

## Required delivery report

Create docs/implementation/TASK-006-CHECKPOINT.md with exact evidence.
