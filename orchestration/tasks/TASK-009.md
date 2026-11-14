---
schema: nighty.task/v1
task_id: TASK-009
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-008]
requirements: [PRODUCTION-PLAN-TASK-009]
created_by: codex
created_at: 2026-11-14T23:10:00+04:00
---

# Add Tag whiteboards and secure attachments

## Objective

Implement newest-first Tag whiteboards and owned local attachment storage for both inline pasted images and ordinary files.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 9
- docs/approved/PRODUCT_DESIGN.md
- docs/approved/STRUCTURED_ACTIONS.md
- AGENTS.md

## Dependencies

TASK-007 editor boundary and TASK-004 authenticated access.

## In scope

- Tag create/rename/reorder/archive/delete and newest-first posts.
- Multipart upload with server-side MIME sniffing, limits, random keys, temporary writes, atomic rename, metadata, and authenticated download.
- Inline image versus ordinary attachment disposition.

## Out of scope

Structured To-do builders on Tags, settings UI, retention cleanup, deployment, push, and merge.

## Required tests and exact commands

- npm test -w @nighty/api -- tags attachments
- npm run test:integration -w @nighty/api -- uploads.security-spec.ts

## Acceptance criteria

- Rename uniqueness, stable reorder, archive history, and in-use delete protection hold.
- Tag posts sort newest-first.
- Server sniffing rejects declared MIME mismatch and unsupported content.
- Storage keys cannot be influenced by display filenames.
- Inline disposition accepts only images; file size is bounded.
- Unauthenticated downloads fail.

## Required delivery report

Create docs/implementation/TASK-009-CHECKPOINT.md with exact evidence.
