---
schema: nighty.task/v1
task_id: TASK-007
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-006]
requirements: [PRODUCTION-PLAN-TASK-007]
created_by: codex
created_at: 2026-11-14T22:30:00+04:00
---

# Add shift canvas entries and revisions

## Objective

Implement day-canvas reads and the exact Update, To-do list, and Follow entry taxonomy with stable editor validation, write permissions, independent To-do toggles, and revision history.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 7
- docs/approved/PRODUCT_DESIGN.md
- docs/approved/STRUCTURED_ACTIONS.md
- AGENTS.md

## Dependencies

TASK-006 operational days and immutable assignment snapshots.

## In scope

- Canvas read, entry create/edit/history, To-do toggle.
- Bounded Tiptap JSON validation and owned plain-text derivation.
- Active/current versus closed/previous and upcoming write rules.
- Author/timestamp attribution and revision snapshots.

## Out of scope

Handover transfer, tag whiteboards, attachment storage, UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- entries
- npm run test:e2e -w @nighty/api -- canvas.e2e-spec.ts

## Acceptance criteria

- Only Update, To-do list, and Follow are accepted.
- Plain text is derived from validated editor JSON.
- Blank To-do rows are removed and at least one remains.
- Only active assigned shifts are writable for operators; administrators may write any active shift.
- Every edit snapshots the previous entry and To-do rows toggle independently.

## Required delivery report

Create docs/implementation/TASK-007-CHECKPOINT.md with exact evidence.
