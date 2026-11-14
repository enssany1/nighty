---
schema: nighty.task/v1
task_id: TASK-012
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-011]
requirements: [PRODUCTION-PLAN-TASK-012]
created_by: codex
created_at: 2026-11-15T00:30:00+04:00
---

# Build Nighty access experience

## Objective

Implement the production browser login, secure session restoration/expiry, role-aware shell, Profile, and password-change experience against the real API.

## In scope

- Invalid/valid login, password visibility, sign out, session restoration and 30-minute expiry messaging.
- Administrator-only Settings presentation and operator denial at the navigation boundary.
- Profile facts, display-name edit, and validated password change.
- Responsive, keyboard-visible, sans-serif browser UI.

## Required tests

- `npm test -w @nighty/web -- auth profile`
- `npm run typecheck -w @nighty/web`
- `npm run build -w @nighty/web`

## Acceptance criteria

- Authentication uses HTTP-only cookie credentials and CSRF on mutations.
- Session loss returns to login with an understandable message.
- Role presentation, Profile facts, and password validation are tested.
- No serif typography is used.
