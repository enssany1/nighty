---
schema: nighty.task/v1
task_id: TASK-005
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-004]
requirements: [PRODUCTION-PLAN-TASK-005]
created_by: codex
created_at: 2026-11-14T22:00:00+04:00
---

# Add user and profile management

## Objective

Implement transactional single-team user administration and self-profile workflows without exposing password material.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 5
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

TASK-004 authenticated session and role boundary.

## In scope

- User list, create, update, disable, and password reset.
- Self profile read and display-name update.
- Normalized immutable usernames and multi-shift assignment.
- Self-disable/demote and last-active-admin prevention.
- One-time temporary-password response, forced change, session revocation, and audit events.

## Out of scope

Shift schedule editing, operational canvas, UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- users
- npm run test:e2e -w @nighty/api -- users.e2e-spec.ts

## Acceptance criteria

- Administrative invariants are enforced transactionally.
- Password hashes and temporary passwords never appear in ordinary user or audit payloads.
- Reset returns the generated temporary password exactly once and requires a subsequent password change.
- Every administrative mutation creates immutable audit evidence.

## Required delivery report

Create docs/implementation/TASK-005-CHECKPOINT.md with exact evidence.
