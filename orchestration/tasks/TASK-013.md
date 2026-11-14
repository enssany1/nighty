---
schema: nighty.task/v1
task_id: TASK-013
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: [TASK-012]
requirements: [PRODUCTION-PLAN-TASK-013]
created_by: codex
created_at: 2026-11-15T01:00:00+04:00
---

# Build Nighty operations workspace

## Objective

Implement the approved daily shift canvas, Tiptap composer, manual Handover, Search, and separate Tag whiteboards against production APIs.

## Required tests

- `npm test -w @nighty/web -- operations editor search tags`
- API and web typechecks and production build.
- Consolidated rendered-browser journeys before final delivery.

## Acceptance criteria

- Original compact calendar and Tags remain in the left sidebar; the canvas starts beside it.
- Previous/current shifts scroll inside the daily canvas, upcoming is read-only, and new dates are separate canvases.
- `/` exposes only Update, To-do list, and Follow; To-do Enter adds rows; Follow transfers during manual Handover.
- Pasted images render inline and fit the canvas; files remain downloadable attachments.
- Search combines approved filters and navigates by stable date/entry IDs.
- Tag whiteboards are separate, editable, newest-first, image-capable surfaces.
- Drafts survive offline/session expiry in local storage.
