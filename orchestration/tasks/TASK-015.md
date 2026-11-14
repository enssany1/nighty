---
schema: nighty.task/v1
task_id: TASK-015
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-014]
requirements: [PRODUCTION-PLAN-TASK-015]
created_by: codex
created_at: 2026-11-14T23:15:00+04:00
---

# Harden accessibility, deployment, backup, and release gates

## Objective

Complete the approved application with real-browser accessibility and responsive coverage, hardened non-root production containers, clean-volume bootstrapping, persistent backup/restore, CI, operations guidance, and a reproducible release gate.

## In scope

- Playwright coverage for authentication, operations, persistence, accessibility, responsive layouts, draft recovery, and Settings.
- Explicit liveness and database-backed readiness endpoints.
- Non-root multi-stage API and web images, reverse-proxy security headers, bounded uploads, and persistent named volumes.
- Idempotent first-start administrator/bootstrap schedule creation without committed credentials.
- Digest-manifested PostgreSQL and attachment backup with explicitly confirmed, named-target restore.
- CI, release documentation, generated-client cleanliness, and production dependency audit.

## Restrictions

- Do not push, merge, or deploy externally.
- Do not commit credentials, local data, backups, generated build output, or browser artifacts.
- Preserve the repository rule that only the human owner may declare the production implementation completed.

## Required verification

- `npm ci && npm run api:generate`
- `npm run check`
- `npm test --workspaces --if-present`
- `npm run test:integration -w @nighty/api`
- `npm run test:e2e`
- `npm run build --workspaces --if-present`
- `npm audit --omit=dev --audit-level=high`
- Local and production Compose validation/build.
- Empty-volume bootstrap, restart persistence, backup, isolated restore, health/readiness, security-header, and non-root runtime drills.

## Acceptance criteria

- All approved desktop, tablet, mobile, keyboard, session, shift, Tag, Settings, and Handover journeys pass in a real browser.
- A clean deployment migrates itself and creates the explicitly supplied first administrator plus a valid 24-hour schedule.
- Inline images, attachments, submitted entries, and Handover state survive restart and restore.
- Backup manifests bind database and attachment archives to SHA-256 digests; restore is explicit and scoped to a named project.
- Production images build, run non-root, expose required security headers, and report both liveness and database readiness.
- The source tree is clean after regeneration and the final checkpoint commit.
