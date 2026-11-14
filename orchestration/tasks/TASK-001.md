---
schema: nighty.task/v1
task_id: TASK-001
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: []
requirements: [PRODUCTION-PLAN-TASK-001]
created_by: codex
created_at: 2026-11-14T21:00:00+04:00
---

# Bootstrap the Nighty production workspace

## Objective

Create the isolated npm-workspaces production foundation for Nighty with strict NestJS and React TypeScript applications, stable API and browser health boundaries, and a locally buildable Docker Compose topology.

## Requirement sources

- docs/approved/PRODUCTION_IMPLEMENTATION_PLAN.md, Task 1
- docs/approved/PRODUCT_DESIGN.md
- AGENTS.md

## Dependencies

The approved UX prototype remains a read-only design source and is not converted or overwritten.

## In scope

- Root npm workspace metadata pinned to Node 24 and npm 11.
- Workspaces for API, web, generated API client, and shared test fixtures.
- GET /api/health returning exactly { "status": "ok" }.
- Nighty browser shell using the approved product name, subtitle, and sans-serif design tokens.
- Strict TypeScript, request IDs, Helmet, request-size limits, and environment port validation.
- Docker Compose services for PostgreSQL, API, and web with persistent database and attachment volumes.
- API/web smoke tests and production image builds.

## Out of scope

- Prisma models, authentication, business workflows, production deployment, merge, and push.

## Implementation instructions

- Observe API and web smoke tests failing before implementation.
- Preserve all orchestration tests and approved documents.
- Do not use any serif font.
- Do not expose credentials or create a deployment.

## Expected files/modules

- package workspace metadata, apps/api, apps/web, packages/api-client, packages/test-fixtures
- compose.yaml and Docker build files

## Technical and security restrictions

- No plaintext production secret.
- No broad request bodies or uncontrolled environment parsing.
- No destructive Git.

## Required tests and exact commands

- npm test -w @nighty/api
- npm test -w @nighty/web
- npm run build --workspaces --if-present
- docker compose config
- docker compose build api web
- npm run check
- git diff --check

## Acceptance criteria

- API and web smoke tests pass after an observed RED state.
- All workspaces typecheck and build.
- Compose configuration validates and both local images build.
- Full orchestration and application test gate exits zero.
- Approved prototype and documents remain unchanged.

## Required delivery report

Because the owner authorized direct Codex implementation rather than runner dispatch, create docs/implementation/TASK-001-CHECKPOINT.md with exact tests, results, files, limitations, and security notes. Do not label it as a DeepSeek delivery or independent runner review.
