# Nighty Acceptance-Test Corrections Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct all seven acceptance-test issues without regressing the approved operational, security, audit, or responsive behavior.

**Architecture:** Keep domain rules in the NestJS services, expose exact REST lifecycle operations, and keep React components responsible only for interaction and presentation. Reuse the existing Entry/TodoItem/FollowTransfer ownership model; do not introduce a second representation for structured actions. Persist only the sidebar display preference in browser storage.

**Tech Stack:** React 19, TypeScript, Tiptap, NestJS, Prisma/PostgreSQL, Vitest/Testing Library, Jest/Supertest, Playwright, Docker Compose.

**Spec:** `docs/approved/TESTING_CORRECTIONS_2026-11-15.md`

## Global Constraints

- Follow `AGENTS.md` and all approved Nighty requirements.
- Use test-driven development: add a focused failing regression, confirm the intended failure, then implement the smallest structural fix.
- Preserve evidence and historical records. Permanent delete is allowed only when the record has no historical references.
- Never expose raw validation messages to users.
- Use sans-serif typography and accessible native controls, labels, focus states, and color contrast.
- Run database-mutating integration suites sequentially.
- Do not use DeepSeek, push, merge, deploy remotely, or shut down the laptop.

## Review Focus

- Structured action ownership remains unified between the composer, API DTO, service, and canvas.
- Follow completion survives reload and cannot create another transfer.
- User/shift deletion is transactionally safe, last-admin protected, and audited.
- Sidebar keyboard, responsive drawer, persistence, and focus behavior are accessible.
- Compact layout remains usable at 390px, 768px, and desktop widths.

### Task 1: Freeze regressions for the compact calendar and composer

**Files:**
- Modify: `apps/web/src/operations/operations.spec.tsx`
- Modify: `apps/web/src/editor/editor.spec.tsx`
- Modify: `apps/web/e2e/operations.spec.ts`

1. Add a November 2026 calendar assertion proving 35 day cells and no sixth week.
2. Add composer tests for inline placement, Enter insertion, double-empty-Enter exit, item deletion, whole-block deletion, blank-row filtering, and derived to-do `plainText`.
3. Run the focused web tests and observe failures caused by current behavior.

### Task 2: Correct calendar and inline To-do interaction

**Files:**
- Modify: `apps/web/src/components/CompactCalendar.tsx`
- Modify: `apps/web/src/editor/EntryComposer.tsx`
- Modify: `apps/web/src/styles/global.css`

1. Derive the calendar cell count from the viewed month and leading offset.
2. Model the to-do builder as inline composer content with stable item identities and explicit remove/exit behavior.
3. Derive to-do `plainText` from normalized rows before calling the API and map unexpected failures to a safe operator message.
4. Run focused web tests until green.

### Task 3: Preserve completed Follow transfers and compact entry history

**Files:**
- Modify: `apps/api/src/operations/canvas.service.ts`
- Modify: `apps/api/src/operations/handover.service.ts`
- Modify: `apps/api/src/operations/handover.service.spec.ts`
- Modify: `apps/api/test/canvas.e2e-spec.ts`
- Modify: `apps/web/src/operations/types.ts`
- Modify: `apps/web/src/operations/DailyCanvas.tsx`
- Modify: `apps/web/src/operations/EntryView.tsx`
- Modify: `apps/web/src/operations/operations.spec.tsx`
- Modify: `apps/web/src/styles/global.css`

1. Add API tests that completed transfer metadata is returned and completed source entries are excluded from subsequent handover transfer creation.
2. Add UI tests for persistent checked Follow rows, completion metadata, nested completed to-dos, and compact author/time/history layout.
3. Return completion actor/time from the canvas owner and render both open and completed incoming Follows without filtering.
4. Keep the timeline compact and ensure todo completion remains independently writable.
5. Run focused API and web tests until green.

### Task 4: Add safe user and shift deletion lifecycles

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`
- Modify: `apps/api/src/shifts/shifts.controller.ts`
- Modify: `apps/api/src/shifts/shifts.service.ts`
- Add/modify: relevant API integration tests under `apps/api/test/`
- Modify: `apps/web/src/settings/SettingsWorkspace.tsx`
- Modify: `apps/web/src/settings/settings.spec.tsx`
- Modify: `apps/web/e2e/settings.spec.ts`

1. Add service and integration tests for unused permanent deletion, referenced deactivation, last-active-admin protection, assignment removal, schedule validation, and audit events.
2. Add `DELETE /users/:id` and `DELETE /shifts/:id` handlers that select the safe outcome transactionally.
3. Add confirmed Delete controls and clear outcome notices to both Settings inspectors.
4. Run focused service, integration, component, and Settings E2E tests until green.

### Task 5: Add persistent collapsible sidebar and responsive drawer

**Files:**
- Modify: `apps/web/src/operations/OperationsWorkspace.tsx`
- Modify: `apps/web/src/operations/OperationsSidebar.tsx`
- Modify: `apps/web/src/operations/operations.spec.tsx`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/e2e/responsive.spec.ts`

1. Add tests for collapse/expand labels, local preference restoration, released canvas width, mobile drawer backdrop, Escape close, and absence of horizontal overflow.
2. Own sidebar state in the workspace, persist the desktop preference, and render accessible desktop and mobile controls.
3. Implement desktop collapsed layout and mobile overlay drawer without changing Settings navigation.
4. Run focused web and responsive tests until green.

### Task 6: Regenerate contracts and complete full verification

**Files:**
- Regenerate only repository-owned API/client artifacts as required.
- Update active execution ledger with evidence and rulings.

1. Run API generation if endpoint contracts changed.
2. Run `npm run check`.
3. Run API integration suites sequentially.
4. Run `npm run test:e2e`.
5. Run `npm run build` and dependency audit.
6. Validate Docker images and the running browser application, including desktop and narrow viewport screenshots.
7. Request a final Codex code review, resolve actionable findings, rerun affected checks, and record exact evidence.
8. Commit with a Conventional Commit subject after all verification is green.
