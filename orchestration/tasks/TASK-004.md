---
schema: nighty.task/v1
task_id: TASK-004
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-002, TASK-003]
requirements: [PRODUCTION-PLAN-TASK-004]
created_by: codex
created_at: 2026-11-14T21:40:00+04:00
---

# Add secure session authentication

## Objective

Implement the approved 30-minute opaque server-side session lifecycle, CSRF protection, and ADMIN/OPERATOR authorization for Nighty.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 4
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

TASK-002 persistence owners and TASK-003 typed contract.

## In scope

- Login, logout, current-session, and change-password endpoints.
- Argon2id password verification and hashing.
- Random 256-bit session and CSRF values with digest-only persistence.
- Thirty-minute inactivity expiry and sliding activity update.
- HttpOnly session cookie flags, CSRF header enforcement, and role guards.

## Out of scope

User administration, business endpoints, UI, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- auth
- npm run test:e2e -w @nighty/api -- auth.e2e-spec.ts
- npm run check
- npm run build --workspaces --if-present

## Acceptance criteria

- Invalid and disabled logins return the same generic response.
- Only token and CSRF digests persist.
- Expired sessions are never extended and are revoked.
- Unsafe authenticated requests require the per-session CSRF value.
- Role requirements reject operators and admit administrators.
- Cookie flags and logout invalidation are verified.

## Required delivery report

Create docs/implementation/TASK-004-CHECKPOINT.md with exact evidence. Do not label direct Codex work as a DeepSeek delivery.
