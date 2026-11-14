---
schema: nighty.task/v1
task_id: TASK-008
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-007]
requirements: [PRODUCTION-PLAN-TASK-008]
created_by: codex
created_at: 2026-11-14T22:50:00+04:00
---

# Add atomic manual Handover

## Objective

Close the current shift and open its ordered successor through an explicit Handover action, transferring every open Follow exactly once without clock coupling.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 8
- docs/approved/PRODUCT_DESIGN.md
- docs/approved/STRUCTURED_ACTIONS.md
- AGENTS.md

## Dependencies

TASK-007 active-state permissions and Follow entries.

## In scope

- Atomic manual Handover, same-day and next-day successor resolution.
- Exactly-once Follow transfers, idempotent retry, concurrency safety, audit.
- Follow completion in the receiving active shift.

## Out of scope

Acknowledgement workflow, clock-triggered transitions, tags, attachments, UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- handover
- npm run test:integration -w @nighty/api -- handover.concurrency-spec.ts

## Acceptance criteria

- Handover is independent of scheduled clock time.
- Current closes and successor opens atomically.
- Every open Follow transfers once; To-do entries do not transfer.
- Repeated and concurrent requests do not duplicate transfers.
- Last shift resolves the first shift of the next operational day.
- Only an assigned operator or administrator may hand over.

## Required delivery report

Create docs/implementation/TASK-008-CHECKPOINT.md with exact evidence.
