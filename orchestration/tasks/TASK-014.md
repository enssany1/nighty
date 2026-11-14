---
schema: nighty.task/v1
task_id: TASK-014
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-013]
requirements: [PRODUCTION-PLAN-TASK-014]
created_by: codex
created_at: 2026-11-15T01:30:00+04:00
---

# Build Nighty administration workspace

## Objective

Implement the selected Option 2 Settings experience with a dedicated sidebar, list/table workspace, desktop inspector, responsive stacked inspector, confirmations, and all seven approved sections.

## Required tests

- `npm test -w @nighty/web -- settings`
- Full frontend test, typecheck, and build gates.
- Consolidated real-browser administrator journey before final delivery.

## Acceptance criteria

- Settings replaces the global sidebar and provides Back to operations.
- Users includes add/edit/disable/reset and multiple shift assignment.
- Shifts explicitly allow overlaps, block uncovered gaps through the API, and reorder safely.
- Tags rename/reorder/archive/delete with in-use recovery.
- General, fixed 30-minute Security, configurable Retention preview/permanent cleanup, and read-only Audit are complete.
