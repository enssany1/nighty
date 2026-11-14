# Nighty Application Implementation Roadmap

**Status:** Planning only; all tasks PLANNED  
**Execution policy:** Sequential, one active task, independent review before checkpoint

## Approved sources

The `E:\Nighty` root is empty, so this roadmap is derived from the approved prototype materials inspected at:

`C:\Users\Yahya\.codex\visualizations\2026\11\13\01a1d509-2481-7e63-8d3f-e925042f1d97\shift-operations-prototype`

Primary sources are the complete interactive design specification, structured shift actions specification, durable prototype decisions in `AGENTS.md`, the working React prototype, its tests, and the existing production implementation plan dated 14 November 2026. Importing/copying these into `E:\Nighty` requires later authorization.

## Fixed architecture and scope

- Responsive browser app for one 24/7 team.
- React + TypeScript + Tiptap; NestJS + TypeScript; PostgreSQL + Prisma.
- Server-side opaque sessions in HTTP-only cookies, CSRF defense, 30-minute inactivity timeout.
- Docker Compose with persistent database and attachment volumes.
- Manual Handover controls the writable shift; clock schedules may overlap but must jointly cover every minute of 24 hours.
- Actions are Update, To-do list, and Follow only. Follow transfers during Handover.
- One-year default retention, administrator-configurable, permanent expiry deletion.
- Modern sans-serif everywhere; WCAG 2.2 AA baseline.
- V1 excludes multi-team, recurring duties, notifications, native mobile, external identity, and incoming acknowledgement.

## Milestones and tasks

| ID | Task | Depends on | Required verification focus | Priority |
|---|---|---|---|---|
| TASK-001 | Bootstrap isolated npm-workspaces monorepo, API/web health, Docker dev config | — | API/web smoke, strict builds, Compose validation | P0 |
| TASK-002 | Prisma schema, migrations, constraints, deterministic development seed | 001 | Clean PostgreSQL migration; ownership/uniqueness/check constraints | P0 |
| TASK-003 | Validated Nest DTOs, OpenAPI, generated frontend client | 001–002 | Contract schemas, unknown-field rejection, clean regeneration | P0 |
| TASK-004 | Secure sessions, Argon2id, CSRF, role guards | 002–003 | cookie flags, token digest, expiry boundary, disabled user, authorization | P0 |
| TASK-005 | Users, shift assignments, profile/password administration | 004 | last-admin/self safeguards, temporary password, audit | P0 |
| TASK-006 | Shift definitions, overlap-valid coverage, operational-day snapshots | 002–005 | overnight/overlap/gap/reorder/snapshot cases | P0 |
| TASK-007 | Daily canvas, entries, To-do lists, revisions | 003–006 | exact taxonomy, current-only writes, Tiptap validation, history | P0 |
| TASK-008 | Atomic manual Handover and Follow transfer | 006–007 | early handover, idempotency, concurrency, next day | P0 |
| TASK-009 | Tags, newest-first whiteboards, inline images, attachments | 003–007 | reorder/rename/archive; MIME/path/size/interrupted upload security | P0 |
| TASK-010 | Typed Settings and immutable Audit | 004–009 | admin-only mutation, before/after events, no audit mutation API | P1 |
| TASK-011 | Search and ownership-aware retention cleanup | 007–010 | filters/paging; boundary, partial failure, retry, file ownership | P0 |
| TASK-012 | Production authentication shell and Profile UI | 003–005 | role navigation, login states, expiry, password validation | P1 |
| TASK-013 | Tiptap operations UI, canvas, search, Tags, draft recovery | 007–009, 011–012 | paste/image/attachment, slash/@, Handover, offline/session draft | P0 |
| TASK-014 | Selected Settings Option 2 administration UI | 005–006, 009–012 | all seven sections, inspectors/sheets, overlap vs gap messaging | P1 |
| TASK-015 | Accessibility, production Compose, backup/restore, CI/release gates | 001–014 | WCAG, responsive, clean volume, persistence, restore drill, full gate | P0 |

## Required task contract

Before dispatch, Codex expands each row into a `TASK-NNN.md` containing objective, requirement citations, dependencies, precise in/out scope, files/modules, restrictions, test-first steps, exact verification commands, acceptance criteria, and required delivery fields. The existing detailed production plan supplies this content and must be reconciled with actual repository paths after TASK-001.

## Milestone acceptance

### M1 — Foundation, persistence, and access (TASK-001–005)

Accept only with clean database setup, generated contract stability, real cookie/CSRF tests, and user safeguards. Compilation alone is insufficient.

### M2 — Shift operations and content (TASK-006–009)

Accept only with overlapping schedules saved, uncovered gaps rejected, manual Handover independent of time, concurrent handover safety, Follow transfer exactly once, and adversarial upload checks.

### M3 — Administration, discovery, and retention (TASK-010–011)

Accept only with typed settings, immutable audit through APIs, stable search destinations, and retryable retention that never claims incomplete deletion.

### M4 — Approved web experience and release (TASK-012–015)

Accept only when the approved design is reproduced responsively without serif fonts, role/permission states work against the real API, drafts survive auth/offline interruption, and clean-volume/backup/restore drills pass.

## Project completion gate

Codex may recommend READY_FOR_ACCEPTANCE only after all 15 tasks are approved/checkpointed, the full release gate passes, limitations are documented, and a human has reviewed the final diff and evidence. COMPLETED remains human-only.
