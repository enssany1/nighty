# Nighty Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, persistent, single-team production web application that faithfully implements the approved Nighty – Shift Operations Handover design.

**Architecture:** Create a new npm-workspaces monorepo separate from the interactive prototype. A React/TypeScript browser client consumes a NestJS REST API whose DTOs generate the OpenAPI client types; Prisma owns PostgreSQL persistence, and a local attachment service owns files on a Docker volume. Manual Handover is the sole authority that closes the writable shift and opens the next ordered shift, even when configured clock schedules overlap.

**Tech Stack:** Node.js 24 LTS, npm workspaces, React with TypeScript, Vite, Tiptap, NestJS with TypeScript, PostgreSQL, Prisma, Argon2id, HTTP-only cookie sessions, OpenAPI-generated client types, Vitest/React Testing Library, Jest/Supertest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-14-complete-interactive-design.md`

**Approved prototype:** `http://localhost:4173/` and the current `src/` implementation in the prototype project.

## Global Constraints

- Production source lives in a new repository root named `nighty`; do not convert or overwrite the UX prototype.
- Version 1 supports one team and a responsive browser application only.
- Product name is **Nighty** and subtitle is **Shift Operations Handover**.
- Frontend is React with TypeScript and Tiptap; backend is NestJS with TypeScript; database is PostgreSQL through Prisma.
- Authentication uses server-side sessions with a random opaque cookie marked `HttpOnly`, `Secure` in production, and `SameSite=Lax`; inactivity expiry is 30 minutes.
- Mutating requests require CSRF protection in addition to SameSite cookies.
- Passwords use Argon2id; plaintext passwords and session tokens are never persisted or logged.
- Deployment uses Docker Compose with persistent PostgreSQL and attachment volumes.
- One modern sans-serif typeface is used everywhere. Times New Roman, Georgia, and every serif typeface are forbidden.
- Supported entry actions are exactly `Update`, `To-do list`, and `Follow`.
- To-do list is a standalone checkbox list; Enter creates the next item. There is no Task, Checklist, Decision, or Issue action.
- Follow items transfer automatically during Handover and remain actionable in the incoming shift.
- Shifts are explicitly ordered. Their scheduled clock ranges may overlap, but their combined active coverage must leave no uncovered minute in 24 hours.
- Clock overlap does not grant edit authority. Only the manually opened current `ShiftInstance` is writable; previous and upcoming instances are read-only.
- Handover is manual and not locked to scheduled clock time. It atomically closes the current shift and opens the next ordered shift.
- The first ordered shift defines the operational-day boundary; a new calendar canvas is materialized for each operational day.
- Tags open independent newest-first whiteboards; tag names are editable, tags are newest-first by default, and administrators may reorder or archive them.
- Pasted images render inline and fit the content canvas; uploaded documents remain attachments. Both persist on the attachment volume.
- Default retention is one year, configurable by an Administrator. Expired records and attachments are permanently deleted.
- Audit history is immutable through application APIs.
- Version 1 excludes multi-team support, recurring duties, notifications, external identity providers, a native mobile application, and incoming-shift acknowledgement.
- WCAG 2.2 AA is the accessibility baseline.
- All behavior changes follow test-first development and each task ends with the named verification command and a Conventional Commit.

## Review Focus

- Two operators submitting or handing over concurrently: one transaction succeeds, duplicates are prevented, and no entry is written to a closed shift. Task 8 owns the concurrency tests.
- Overlapping, overnight, reordered, and malformed schedules: overlap remains valid, every minute stays covered, and historical instances retain snapshots. Task 6 owns these tests.
- Session expiry or CSRF failure while a draft exists: the API rejects the mutation without data loss and the client preserves the draft through reauthentication. Tasks 4 and 13 own these tests.
- Malicious or malformed attachments and editor documents: path traversal, MIME spoofing, oversized files, and unsupported Tiptap nodes are rejected without orphaned files. Task 9 owns these tests.
- Retention when file deletion or database cleanup partially fails: the job remains retryable, reports the retained resource, and never claims deletion prematurely. Task 11 owns these tests.

---

## Repository Structure

```text
nighty/
  apps/
    api/
      prisma/
        schema.prisma
        migrations/
        seed.ts
      src/
        auth/
        users/
        shifts/
        operations/
        entries/
        tags/
        attachments/
        search/
        audit/
        retention/
        settings/
        common/
        app.module.ts
        main.ts
      test/
    web/
      src/
        api/
        auth/
        app/
        operations/
        editor/
        search/
        profile/
        settings/
        components/
        styles/
      e2e/
  packages/
    api-client/
      src/generated.ts
    test-fixtures/
  docker/
    api.Dockerfile
    web.Dockerfile
    nginx.conf
  scripts/
    backup.ps1
    restore.ps1
  compose.yaml
  compose.production.yaml
  .env.example
  .nvmrc
  package.json
  package-lock.json
  README.md
```

Prisma schema and migrations own database meaning. Nest services own authorization and workflow transitions. The generated API client owns frontend request/response types. React feature folders own screen behavior; shared components do not reinterpret domain state.

---

## Milestone 1 — Foundation, Persistence, and Access

### Task 1: Bootstrap the isolated monorepo and runtime health boundary

**Files:**
- Create: `.nvmrc`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`
- Create: `apps/api/**`, `apps/web/**`, `packages/api-client/**`, `packages/test-fixtures/**`
- Create: `compose.yaml`, `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx.conf`
- Test: `apps/api/src/health/health.controller.spec.ts`, `apps/web/src/app/App.spec.tsx`

**Interfaces:**
- Produces: npm workspaces `@nighty/api`, `@nighty/web`, `@nighty/api-client`, and `@nighty/test-fixtures`; `GET /api/health -> { status: "ok" }`.

- [ ] **Step 1: Create the root workspace and failing API/web smoke tests**

  Pin Node 24 and npm in the root metadata. API test expects `GET /api/health` to return 200 and `{ status: "ok" }`; web test expects the Nighty name and subtitle.

- [ ] **Step 2: Run the smoke tests and verify RED**

  Run: `npm test --workspaces --if-present`

  Expected: FAIL because the health module and application shell do not exist.

- [ ] **Step 3: Implement the minimal NestJS and React/Vite applications**

  Add strict TypeScript, environment validation, structured request IDs, `/api` prefix, Helmet, request-size limits, and the approved sans-serif design tokens. Do not implement feature screens yet.

- [ ] **Step 4: Add Docker development services**

  `compose.yaml` defines `postgres`, `api`, and `web`; only PostgreSQL and attachment paths use named volumes. Add health checks and dependency ordering.

- [ ] **Step 5: Verify GREEN**

  Run: `npm test --workspaces --if-present && npm run build --workspaces --if-present && docker compose config`

  Expected: all smoke tests pass, both applications build, and Compose configuration validates.

- [ ] **Step 6: Commit**

  `git commit -m "chore: bootstrap Nighty production workspace"`

### Task 2: Define Prisma ownership, migrations, and seed data

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/*/migration.sql`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/database/prisma.service.ts`
- Test: `apps/api/test/database/schema.integration-spec.ts`

**Interfaces:**
- Produces: Prisma models `User`, `Session`, `ShiftDefinition`, `OperationalDay`, `ShiftInstance`, `ShiftAssignment`, `Entry`, `TodoItem`, `FollowTransfer`, `EntryRevision`, `Tag`, `TagPost`, `Attachment`, `AuditEvent`, and `AppSetting`.
- Stable enums: `UserRole`, `UserStatus`, `ShiftStatus`, `EntryType`, `FollowStatus`, `AttachmentDisposition`.

- [ ] **Step 1: Write failing schema integration tests**

  Assert uniqueness of username and tag name, one ordered shift position per active definition, exactly one attachment parent, immutable audit IDs, entry-to-shift ownership, and cascade/restrict behavior matching retention ownership.

- [ ] **Step 2: Run against disposable PostgreSQL and verify RED**

  Run: `npm run test:integration -w @nighty/api -- schema.integration-spec.ts`

  Expected: FAIL because migrations and Prisma models are absent.

- [ ] **Step 3: Implement the schema and first migration**

  Store editor documents and revision snapshots as JSONB plus normalized `plainText` for search. Store only SHA-256 session-token digests. Add SQL check constraints Prisma cannot express, including exactly one attachment parent.

- [ ] **Step 4: Add deterministic development seed data**

  Seed Aisha Rahman plus three operators, the three approved shifts, tags, one operational day, representative entries, and Settings defaults. Hash the documented development password; never seed plaintext outside development.

- [ ] **Step 5: Verify GREEN**

  Run: `npm run prisma:reset:test -w @nighty/api && npm run test:integration -w @nighty/api -- schema.integration-spec.ts`

  Expected: migration, seed, and constraints pass on a clean database.

- [ ] **Step 6: Commit**

  `git commit -m "feat: define Nighty persistence model"`

### Task 3: Generate and enforce the API contract

**Files:**
- Create: `apps/api/src/common/dto/**`
- Create: `apps/api/src/openapi.ts`
- Create: `packages/api-client/scripts/generate.mjs`
- Generate: `packages/api-client/src/generated.ts`
- Test: `apps/api/test/openapi.contract-spec.ts`, `packages/api-client/src/generated.spec.ts`

**Interfaces:**
- Produces: validated Nest DTOs, OpenAPI JSON, and generated request/response types consumed by the web application.

- [ ] **Step 1: Write failing contract tests**

  Assert exact schemas for authentication, users, shifts, canvas, entries, handover, tags, uploads, search, settings, and audit. Confirm rejected unknown fields and generated-client compilation.

- [ ] **Step 2: Verify RED**

  Run: `npm run test:contract -w @nighty/api && npm test -w @nighty/api-client`

  Expected: FAIL because DTOs and generated client do not exist.

- [ ] **Step 3: Implement DTO validation and generation**

  Use Nest global validation with whitelist and forbid-non-whitelisted enabled. Make generated OpenAPI types the only web API payload types.

- [ ] **Step 4: Verify GREEN and generation cleanliness**

  Run: `npm run api:generate && npm run test:contract -w @nighty/api && npm test -w @nighty/api-client && git diff --exit-code packages/api-client/src/generated.ts`

  Expected: tests pass and regeneration produces no diff.

- [ ] **Step 5: Commit**

  `git commit -m "feat: establish typed API contract"`

### Task 4: Implement secure sessions, CSRF, and role authorization

**Files:**
- Create: `apps/api/src/auth/**`
- Create: `apps/api/src/common/guards/**`
- Create: `apps/api/src/common/decorators/**`
- Test: `apps/api/src/auth/auth.service.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`, CSRF token delivery, `SessionGuard`, and `RolesGuard`.

- [ ] **Step 1: Write failing authentication tests**

  Cover Argon2id verification, disabled account, generic invalid-credential response, 30-minute inactivity boundary, sliding last-activity update, hashed token persistence, cookie flags, token rotation on login, logout invalidation, CSRF rejection, and ADMIN/OPERATOR authorization.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- auth && npm run test:e2e -w @nighty/api -- auth.e2e-spec.ts`

  Expected: FAIL because authentication services and guards are absent.

- [ ] **Step 3: Implement session lifecycle**

  Generate 256-bit random tokens, store only their SHA-256 digests, check inactivity against `lastActivityAt`, and revoke expired sessions. Never extend an already expired session.

- [ ] **Step 4: Implement CSRF and authorization**

  Require a per-session CSRF value on unsafe methods. Operators cannot access Settings endpoints even when they guess URLs.

- [ ] **Step 5: Verify GREEN**

  Run: `npm test -w @nighty/api -- auth && npm run test:e2e -w @nighty/api -- auth.e2e-spec.ts`

  Expected: authentication and authorization suites pass.

- [ ] **Step 6: Commit**

  `git commit -m "feat: add secure session authentication"`

### Task 5: Implement users and profile administration

**Files:**
- Create: `apps/api/src/users/**`
- Test: `apps/api/src/users/users.service.spec.ts`, `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Produces: user list/filter/create/update/disable/reset-password endpoints and self-profile/password endpoints.

- [ ] **Step 1: Write failing user-management tests**

  Cover normalized unique usernames, immutable username after creation, multi-shift assignment, self-disable/self-demote prevention, last-active-admin prevention, temporary-password one-time return, forced password change, and audit event creation.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- users && npm run test:e2e -w @nighty/api -- users.e2e-spec.ts`

  Expected: FAIL because the Users module is absent.

- [ ] **Step 3: Implement transactional user workflows**

  Lock active Administrator rows when enforcing the last-admin invariant. Return the generated temporary password only in the reset response; persist only its Argon2id hash.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/api -- users && npm run test:e2e -w @nighty/api -- users.e2e-spec.ts`

  Expected: all user and profile tests pass.

- [ ] **Step 5: Commit**

  `git commit -m "feat: add user and profile management"`

---

## Milestone 2 — Shift Operations and Content

### Task 6: Implement overlapping schedule validation and operational-day materialization

**Files:**
- Create: `apps/api/src/shifts/**`
- Create: `apps/api/src/operations/operational-day.service.ts`
- Test: `apps/api/src/shifts/shift-coverage.spec.ts`, `apps/api/test/shifts.e2e-spec.ts`

**Interfaces:**
- Produces: `validateCoverage(shifts): CoverageResult`, shift CRUD/reorder endpoints, and `materializeOperationalDay(date): OperationalDay`.
- `CoverageResult` is `{ valid: true }` or `{ valid: false, uncovered: Array<{ startMinute, endMinute }> }`.

- [ ] **Step 1: Write failing schedule tests**

  Cover the approved schedule, overlap 12:00–20:00, multiple overlaps, overnight shifts, an uncovered one-minute gap, zero duration, duplicate active names, inactive definitions, reorder, and snapshot preservation after definition edits.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- shift-coverage && npm run test:e2e -w @nighty/api -- shifts.e2e-spec.ts`

  Expected: FAIL because coverage and materialization services are absent.

- [ ] **Step 3: Implement circular 24-hour union coverage**

  Normalize each active interval onto minutes `0..1439`, mark its covered union, permit any overlap, and return exact uncovered ranges. The first ordered definition anchors the operational date boundary.

- [ ] **Step 4: Materialize immutable shift snapshots**

  Copy definition name, scheduled start/end, order, and assignments into `ShiftInstance`; later Settings edits never rewrite history.

- [ ] **Step 5: Verify GREEN**

  Run: `npm test -w @nighty/api -- shift-coverage && npm run test:e2e -w @nighty/api -- shifts.e2e-spec.ts`

  Expected: overlapping schedules save, gaps fail with ranges, and snapshots remain unchanged.

- [ ] **Step 6: Commit**

  `git commit -m "feat: add overlapping shift schedules"`

### Task 7: Implement daily canvas, entries, To-do lists, and revisions

**Files:**
- Create: `apps/api/src/operations/**`
- Create: `apps/api/src/entries/**`
- Create: `apps/api/src/common/editor-document.ts`
- Test: `apps/api/src/entries/entries.service.spec.ts`, `apps/api/test/canvas.e2e-spec.ts`

**Interfaces:**
- Produces: canvas read endpoint, entry create/edit/history endpoints, To-do item toggle endpoint, and stable editor-document validation.

- [ ] **Step 1: Write failing entry tests**

  Cover exact action taxonomy, blank Update rejection, blank To-do rows removed, at least one To-do required, independent toggles, unsupported Tiptap nodes rejected, author/timestamp attribution, revision snapshots, and current/previous/upcoming write permissions.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- entries && npm run test:e2e -w @nighty/api -- canvas.e2e-spec.ts`

  Expected: FAIL because entry workflows are absent.

- [ ] **Step 3: Implement canvas reads and entry transactions**

  Resolve write permission from `ShiftInstance.status`, assignment, and user role—not from wall-clock schedule. Normalize plain text once from validated Tiptap JSON and create a revision in the same transaction as every edit.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/api -- entries && npm run test:e2e -w @nighty/api -- canvas.e2e-spec.ts`

  Expected: all taxonomy, permission, and revision tests pass.

- [ ] **Step 5: Commit**

  `git commit -m "feat: add shift canvas entries and revisions"`

### Task 8: Implement manual Handover and Follow transfer atomically

**Files:**
- Create: `apps/api/src/operations/handover.service.ts`
- Create: `apps/api/src/operations/handover.controller.ts`
- Test: `apps/api/src/operations/handover.service.spec.ts`, `apps/api/test/handover.concurrency-spec.ts`

**Interfaces:**
- Produces: `POST /api/shift-instances/:id/handover` and `PATCH /api/follows/:id/status`.

- [ ] **Step 1: Write failing handover tests**

  Cover early handover independent of clock, closing current/opening next, transfer of every open Follow exactly once, To-do non-transfer, no incoming acknowledgement, last-shift transition to next operational day, authorization, idempotent retry, and two concurrent Handover requests.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- handover && npm run test:integration -w @nighty/api -- handover.concurrency-spec.ts`

  Expected: FAIL because Handover workflow is absent.

- [ ] **Step 3: Implement one serializable transaction**

  Lock the current instance and ordered successor, verify current status, close/open them, create Follow transfers, and write one audit event. A repeated request returns the already-completed result without duplicating transfers.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/api -- handover && npm run test:integration -w @nighty/api -- handover.concurrency-spec.ts`

  Expected: one concurrent transition succeeds, the other is safely idempotent or conflicts, and data remains consistent.

- [ ] **Step 5: Commit**

  `git commit -m "feat: add atomic shift handover"`

### Task 9: Implement Tags, inline images, and attachments

**Files:**
- Create: `apps/api/src/tags/**`
- Create: `apps/api/src/attachments/**`
- Create: `apps/api/src/common/storage/**`
- Test: `apps/api/src/tags/tags.service.spec.ts`, `apps/api/src/attachments/attachments.service.spec.ts`, `apps/api/test/uploads.security-spec.ts`

**Interfaces:**
- Produces: tag CRUD/reorder/archive, newest-first Tag posts, multipart upload, authorized download, and attachment metadata endpoints.

- [ ] **Step 1: Write failing tag and upload tests**

  Cover newest-first creation, stable reorder, rename uniqueness, in-use deletion blocked, archive preserving history, pasted-image inline disposition, ordinary attachment disposition, MIME sniff mismatch, path traversal filename, oversized file, interrupted write cleanup, and unauthorized download.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- tags attachments && npm run test:integration -w @nighty/api -- uploads.security-spec.ts`

  Expected: FAIL because Tag and attachment services are absent.

- [ ] **Step 3: Implement owned local storage**

  Generate random storage keys, retain original names only as display metadata, sniff server-side MIME, enforce configured limits, write to a temporary file, persist metadata transactionally, then atomically rename. Cleanup failures retain a retryable owned record.

- [ ] **Step 4: Implement Tag whiteboards**

  Posts sort newest-first and use the same validated editor document plus attachments. Archived tags remain resolvable on history but cannot receive new posts.

- [ ] **Step 5: Verify GREEN**

  Run: `npm test -w @nighty/api -- tags attachments && npm run test:integration -w @nighty/api -- uploads.security-spec.ts`

  Expected: functional and adversarial tests pass with no orphaned unowned files.

- [ ] **Step 6: Commit**

  `git commit -m "feat: add tag whiteboards and attachments"`

---

## Milestone 3 — Administration, Discovery, and Retention

### Task 10: Implement Settings and immutable Audit

**Files:**
- Create: `apps/api/src/settings/**`
- Create: `apps/api/src/audit/**`
- Test: `apps/api/src/settings/settings.service.spec.ts`, `apps/api/test/audit.e2e-spec.ts`

**Interfaces:**
- Produces: General, Security, and Retention Settings endpoints plus filtered Audit reads.

- [ ] **Step 1: Write failing settings/audit tests**

  Assert Asia/Muscat and 24-hour defaults, 30-minute timeout, one-year retention, Administrator-only mutation, before/after audit snapshots, actor/request/session metadata, chronological filters, and no update/delete Audit endpoint.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/api -- settings audit && npm run test:e2e -w @nighty/api -- audit.e2e-spec.ts`

  Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement typed Settings and centralized audit writer**

  Avoid untyped key/value interpretation in consumers: Settings service parses and returns named typed values. Every privileged mutation calls the audit writer inside its transaction.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/api -- settings audit && npm run test:e2e -w @nighty/api -- audit.e2e-spec.ts`

  Expected: Settings and immutable Audit tests pass.

- [ ] **Step 5: Commit**

  `git commit -m "feat: add settings and immutable audit"`

### Task 11: Implement search and safe retention cleanup

**Files:**
- Create: `apps/api/src/search/**`
- Create: `apps/api/src/retention/**`
- Test: `apps/api/src/search/search.service.spec.ts`, `apps/api/src/retention/retention.service.spec.ts`, `apps/api/test/retention.failure-spec.ts`

**Interfaces:**
- Produces: filtered search endpoint, retention preview endpoint, and idempotent cleanup command/job.

- [ ] **Step 1: Write failing search tests**

  Cover text, inclusive date range, operator, shift, tag, action type, Follow status, stable result destination IDs, pagination, no-result filters, and PostgreSQL search indexes.

- [ ] **Step 2: Write failing retention tests**

  Cover one-year boundary, attachment inheritance, permanent deletion, dry-run preview, repeat execution, legal ownership of each file, database failure before files, file deletion failure, cleanup retry, and audit summary.

- [ ] **Step 3: Verify RED**

  Run: `npm test -w @nighty/api -- search retention && npm run test:integration -w @nighty/api -- retention.failure-spec.ts`

  Expected: FAIL because search and cleanup workflows are absent.

- [ ] **Step 4: Implement indexed search**

  Search uses server-owned plain text and stable identity fields; it never reparses rendered HTML. Apply bounded pagination and deterministic timestamp/ID ordering.

- [ ] **Step 5: Implement two-phase retention cleanup**

  Mark eligible records, delete owned files with recorded outcomes, and finalize database deletion only when required cleanup succeeds. Retain failed ownership records for retry and report partial failure accurately.

- [ ] **Step 6: Verify GREEN**

  Run: `npm test -w @nighty/api -- search retention && npm run test:integration -w @nighty/api -- retention.failure-spec.ts`

  Expected: filter, boundary, failure, and retry tests pass.

- [ ] **Step 7: Commit**

  `git commit -m "feat: add search and retention lifecycle"`

---

## Milestone 4 — Approved Web Experience and Release

### Task 12: Build authentication, app shell, and Profile UI

**Files:**
- Create: `apps/web/src/api/**`, `apps/web/src/auth/**`, `apps/web/src/app/**`, `apps/web/src/profile/**`, `apps/web/src/components/**`
- Test: colocated `*.spec.tsx`; Playwright `apps/web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: generated API client and auth endpoints.
- Produces: Login, session restore, role-aware operations/settings navigation, session-expired flow, sign out, and Profile/change-password screens.

- [ ] **Step 1: Write failing component and E2E tests**

  Cover valid/invalid/disabled login, Show password, administrator Settings visibility, operator Settings absence and direct-route denial, 30-minute expiry, return-to-login, profile facts, and password validation.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/web -- auth profile && npm run test:e2e -w @nighty/web -- auth.spec.ts`

  Expected: FAIL because the production shell is absent.

- [ ] **Step 3: Implement from approved prototype**

  Recreate the approved visual tokens and responsive shell in focused components. Do not copy prototype in-memory security behavior; consume real session endpoints.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/web -- auth profile && npm run test:e2e -w @nighty/web -- auth.spec.ts`

  Expected: access flows and permission presentation pass.

- [ ] **Step 5: Commit**

  `git commit -m "feat: build Nighty access experience"`

### Task 13: Build daily canvas, Tiptap composer, Search, and Tag whiteboards

**Files:**
- Create: `apps/web/src/operations/**`, `apps/web/src/editor/**`, `apps/web/src/search/**`, `apps/web/src/tags/**`
- Test: colocated specs; Playwright `apps/web/e2e/operations.spec.ts`, `handover.spec.ts`, `draft-recovery.spec.ts`

**Interfaces:**
- Consumes: canvas, entries, Handover, Follow, attachment, Tag, Search, and history APIs.
- Produces: approved operations workspace end-to-end.

- [ ] **Step 1: Write failing editor/canvas tests**

  Cover `/` actions, `@` mentions, Enter adding To-do rows, image paste inline, attachment upload, current-only editing, previous/upcoming read-only, attribution/history, newest-first Tag posts, editable Tag name, and image fit.

- [ ] **Step 2: Write failing journey tests**

  Cover Submit, early Handover, Follow transfer/completion, Search filters/result highlight, offline rejection, session expiry during a draft, reauthentication, and draft restoration.

- [ ] **Step 3: Verify RED**

  Run: `npm test -w @nighty/web -- operations editor search tags && npm run test:e2e -w @nighty/web -- operations.spec.ts handover.spec.ts draft-recovery.spec.ts`

  Expected: FAIL because the workspace screens are absent.

- [ ] **Step 4: Implement Tiptap schema and draft lifecycle**

  Allow only approved nodes/marks, store draft locally by operational day and shift instance, upload pasted images before inserting their attachment IDs, and preserve drafts across offline/session-expired states.

- [ ] **Step 5: Implement canvas and manual Handover UI**

  Keep current/previous sections scrollable within the day canvas; a new operational day gets a new canvas. Handover confirmation reflects transferred Follow count and never depends on clock time.

- [ ] **Step 6: Verify GREEN**

  Run: `npm test -w @nighty/web -- operations editor search tags && npm run test:e2e -w @nighty/web -- operations.spec.ts handover.spec.ts draft-recovery.spec.ts`

  Expected: component and full journeys pass.

- [ ] **Step 7: Commit**

  `git commit -m "feat: build Nighty operations workspace"`

### Task 14: Build the selected administration experience

**Files:**
- Create: `apps/web/src/settings/**`
- Test: colocated specs; Playwright `apps/web/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: Users, Shifts, Tags, General, Security, Retention, and Audit APIs.
- Produces: selected Option 2 Settings sidebar, tables/lists, inspectors, dialogs, confirmations, and responsive sheets.

- [ ] **Step 1: Write failing Settings tests**

  Cover all seven sections; Add/edit/disable/reset user; last-admin safeguards; overlapping shift save; uncovered-gap rejection; reorder; Tag archive/in-use deletion; Security save; Retention preview/confirmation; and Audit filters/read-only inspector.

- [ ] **Step 2: Verify RED**

  Run: `npm test -w @nighty/web -- settings && npm run test:e2e -w @nighty/web -- settings.spec.ts`

  Expected: FAIL because Settings screens are absent.

- [ ] **Step 3: Implement from selected Option 2 reference**

  Settings replaces the global operations sidebar and uses Back to operations. Desktop uses the right inspector; mobile uses a full-width sheet. Show explicitly that shift overlap is allowed and only uncovered gaps block Save.

- [ ] **Step 4: Verify GREEN**

  Run: `npm test -w @nighty/web -- settings && npm run test:e2e -w @nighty/web -- settings.spec.ts`

  Expected: Settings behavior and responsive journeys pass.

- [ ] **Step 5: Commit**

  `git commit -m "feat: build Nighty administration workspace"`

### Task 15: Harden accessibility, deployment, backup, and release gates

**Files:**
- Create: `apps/web/e2e/accessibility.spec.ts`, `apps/web/e2e/responsive.spec.ts`
- Create: `compose.production.yaml`, `scripts/backup.ps1`, `scripts/restore.ps1`
- Create: `.github/workflows/ci.yml`, `README.md`, `docs/operations.md`
- Modify: Dockerfiles, nginx configuration, root scripts

**Interfaces:**
- Consumes: complete application.
- Produces: tested production images, persistent deployment, documented backup/restore, CI gate, and release checklist.

- [ ] **Step 1: Write failing deployment and accessibility checks**

  Test keyboard focus/focus return, semantic dialogs/tables, live regions, contrast, 390/768/1280 responsive layouts, no horizontal page overflow, attachment persistence after restart, database migration on empty volume, graceful shutdown, and health/readiness behavior.

- [ ] **Step 2: Verify RED**

  Run: `npm run check && npm run test:e2e && docker compose -f compose.yaml -f compose.production.yaml config`

  Expected: FAIL until production configuration and remaining accessibility issues are implemented.

- [ ] **Step 3: Implement hardened containers and reverse proxy**

  Run as non-root, use multi-stage builds, set security headers and upload limits, expose only the proxy, mount named data volumes, and document secrets supplied outside source control.

- [ ] **Step 4: Implement and test backup/restore**

  Backup PostgreSQL and the attachment volume under one timestamped manifest with digests. Restore requires explicit confirmation, checks manifest/digests, and targets a named deployment directory/volume only.

- [ ] **Step 5: Run the complete release gate**

  Run: `npm ci && npm run api:generate && git diff --exit-code && npm run check && npm test --workspaces --if-present && npm run test:integration -w @nighty/api && npm run test:e2e && npm run build --workspaces --if-present && docker compose -f compose.yaml -f compose.production.yaml build`

  Expected: every command exits 0, generated client is clean, and production images build.

- [ ] **Step 6: Run real Docker smoke and restore drills**

  Start on clean named volumes, sign in, create an inline image and attachment, submit/handover, restart services, verify persistence, take a backup, restore to separate test volumes, and verify record/file counts and digests.

- [ ] **Step 7: Commit**

  `git commit -m "chore: prepare Nighty production release"`

---

## Completion Definition

- Approved administrator and operator journeys pass against real PostgreSQL and filesystem storage.
- The overlapping-shift rule is enforced consistently by API, Settings UI, tests, and documentation.
- Manual Handover and Follow transfer are transactionally safe and independent of scheduled clock time.
- Sessions expire after 30 inactive minutes; CSRF, authorization, password hashing, and attachment controls pass adversarial tests.
- Retention cleanup is retryable, ownership-aware, and honest about partial failure.
- Desktop, tablet, and mobile browser layouts meet the approved design without serif typography.
- Clean-volume deployment, restart persistence, backup, and restore drills are documented and verified.
- Production implementation is not declared ready until a human owner reviews the final diff and validation evidence.
