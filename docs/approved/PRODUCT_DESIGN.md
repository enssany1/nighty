# Nighty Complete Interactive Design

## Intent

Complete the browser-based UX prototype for Nighty – Shift Operations Handover so the full version-1 product can be reviewed and approved before production implementation starts.

This document defines interactive mock behavior only. It does not authorize a backend, database, real authentication, persistent files, deployment, or other production implementation.

## Selected visual direction

The selected direction is the revised version of visual option 2:

- Reference: `C:\Users\Yahya\.codex\generated_images\01a1d509-2481-7e63-8d3f-e925042f1d97\exec-517b1e24-8a09-4ade-8378-f79efdc045e6.png`.
- Opening Settings switches the global sidebar from operations navigation to a dedicated administration navigation.
- A clear **Back to operations** control restores the daily canvas and normal sidebar.
- Settings sections are General, Shifts, Users, Tags, Security, Retention, and Audit.
- Detail-heavy editing uses a right-side inspector on desktop and a full-width sheet on narrow screens.

### Permanent typography rule

Nighty uses the same modern sans-serif UI typeface everywhere. Times New Roman, Georgia, slab serif, and every other serif font are prohibited for the product name, page headings, dates, dialogs, settings, tables, fields, and all other UI text.

## Approaches considered

1. **Dedicated administration mode — selected.** The existing sidebar becomes the Settings navigation, with a Back to operations control. This gives administration enough space and avoids a second navigation rail.
2. **Second settings rail.** Preserves the calendar and Tags while adding another vertical navigation rail. Rejected because it creates three competing columns on smaller laptops.
3. **Horizontal settings tabs.** Preserves the normal operations sidebar and uses tabs above the settings content. Rejected because seven settings areas create a crowded, less scalable header.

## Goals

- Make every approved version-1 screen and primary interaction reviewable in the browser.
- Preserve the approved daily canvas, calendar, Tags, To-do list, Follow, and Handover interactions.
- Complete Settings, user management, authentication/profile states, search/filtering, permissions, and audit/history.
- Use realistic in-memory mock data and immediate success/error feedback.
- Make administrator and operator experiences visibly different.
- Verify desktop and responsive layouts without horizontal scrolling or hidden primary actions.

## Non-goals

- No NestJS backend, PostgreSQL, Prisma, Docker Compose, API, or database schema.
- No real authentication, cookie/session implementation, hashing, identity integration, or email delivery.
- No persistent uploads, backup/restore engine, reporting integration, or production deployment.
- No multi-team administration, recurring duty templates, notifications, or mobile application.
- No incoming-shift acknowledgement workflow in version 1; manual Handover remains the transition control.

## Global interaction model

- The prototype remains a responsive browser application.
- Administrator mock user: **Aisha Rahman**.
- Operator mock users: **Marcus Lee**, **Daniel Wong**, and **Ethan Park**.
- Destructive mock actions require confirmation and then update in-memory state with a visible toast.
- Reloading the page resets mock data; the interface must state that this is a prototype where relevant.
- Buttons, filters, forms, drawers, dialogs, tabs, and primary navigation shown in core flows must work.
- Loading, empty, error, permission-denied, disabled-account, session-expired, and offline states must be reachable through realistic interactions or a clearly labeled prototype state switcher.

## Navigation

### Operations mode

Preserve the current Nighty sidebar: brand, Search, calendar, Tags, and profile menu. The administrator profile menu contains **My profile**, **Settings**, and **Sign out**. Operators do not see Settings.

### Settings mode

The sidebar contains:

1. Back to operations
2. General
3. Shifts
4. Users
5. Tags
6. Security
7. Retention
8. Audit

The selected item uses the current restrained green highlight and left accent. The profile block remains at the bottom.

At narrow widths, Settings navigation becomes the existing mobile drawer pattern. Right-side inspectors become full-width sheets with a visible close action.

## Screen specifications

### 1. Login and session states

The login screen uses the Nighty brand, username, password, Show password, Sign in, validation, and a concise security message. It does not include public registration or social login.

Interactive states:

- Invalid credentials error without clearing the username.
- Disabled account message.
- Session expired page/dialog explaining the 30-minute inactivity timeout and returning to Login.
- Sign out returns to Login.
- A prototype-only **Enter as Administrator** and **Enter as Operator** control may be included discreetly so both role experiences are reviewable without real credentials.

### 2. My profile

Profile shows display name, username, role, assigned shifts, and password change. Username and role are read-only for the user. Change password uses Current password, New password, Confirm password, visible requirements, validation, Cancel, and Save.

### 3. General settings

General contains:

- Application name: Nighty.
- Subtitle: Shift Operations Handover.
- Timezone: Asia/Muscat.
- Date format and 12/24-hour time format.
- Default landing view: current operational day.

Save is disabled until a value changes. Cancel restores the saved mock values. Successful save shows a toast.

### 4. Shift settings

The page shows a 24-hour coverage strip and an ordered shift list. Initial shifts are Morning 07:00–15:00, Evening 15:00–23:00, and Night 23:00–07:00.

Administrators can:

- Add a shift.
- Edit name, start time, end time, and active status in a right inspector.
- Reorder shifts.
- See overnight/cross-midnight labeling.
- See whether the active schedule covers the complete 24-hour operational day that begins with the first shift.

Validation blocks empty names, duplicate active names, zero-duration shifts, and incomplete 24-hour coverage. A warning explains that historical records keep their original shift snapshot.

Active shifts may overlap. Overlap is valid and must not block saving; validation only blocks uncovered time gaps in the combined 24-hour schedule.

### 5. User management

The Users page follows the selected visual reference. It contains search, Role filter, Status filter, Add user, a compact table, row selection, and a right inspector.

Table columns:

- Name
- Username
- Role
- Assigned shifts
- Status
- Last sign-in
- Row actions

Add user dialog fields:

- Display name
- Username
- Temporary password
- Role: Administrator or Operator
- Assigned shifts
- Account status

User inspector supports:

- Edit display name.
- Change role.
- Assign one or more shifts.
- Activate or disable account.
- Reset password with a generated temporary password shown once in the mock flow.
- View created date and last sign-in.

Safeguards:

- Aisha cannot disable or demote her own currently signed-in administrator account.
- At least one active Administrator must remain.
- Username becomes read-only after creation.
- Confirmation is required before disabling a user or resetting a password.

### 6. Tag settings

Tags uses a clean list, not a card grid. It supports search, Add tag, inline rename, drag reordering, Active/Archived status, usage count, and delete.

- Archived tags remain visible on historical records but are unavailable for new entries.
- Delete is blocked when a tag is in use; the interface recommends Archive.
- Creating, renaming, or reordering immediately updates the operations sidebar mock state.

### 7. Security settings

Security shows:

- Automatic inactivity timeout: 30 minutes.
- Password minimum length and basic password requirements for local authentication.
- Failed-login lockout settings as clearly labeled proposed defaults in the prototype.
- Active-session summary for the current user with a mock **Sign out other sessions** confirmation.

The 30-minute timeout is the approved default and appears as the active saved value.

### 8. Retention settings

Retention shows:

- Handover record retention: 1 year by default.
- Attachment retention follows its parent record.
- Administrator-selectable duration.
- A clear warning that expired data is permanently deleted.
- A confirmation step before changing the saved retention policy.

The prototype displays an explanatory preview such as “Records older than 14 November 2025 would be eligible for permanent deletion” using the current date anchor of 14 November 2026.

### 9. Audit

Audit is a chronological table/list with filters for date, user, action, and area. It shows realistic events for sign-in, user changes, shift settings, tag changes, retention changes, entry edits, and handovers.

Selecting an event opens a read-only inspector showing actor, timestamp, action, target, previous value, new value, and request/session metadata placeholders suitable for later production design.

Audit events cannot be edited or deleted in the prototype.

### 10. Search and history

Expand the current search dialog into a working search experience with:

- Text query.
- Date range.
- Operator.
- Shift.
- Tag.
- Action type: Update, To-do list, or Follow.
- Open/completed Follow status.

Results show operational date, shift, author, timestamp, matched text, and tags. Selecting a result returns to the appropriate daily canvas and highlights the matching entry.

The design includes recent results, no-results, filtered-empty, and clear-filters states.

### 11. Entry attribution and history

Every entry displays author and timestamp in a compact way consistent with the current canvas. Editable current-shift entries expose Edit and history actions. Historical/closed-shift entries remain read-only.

History opens a read-only inspector showing revisions, author, time, and what changed. The prototype uses mock revisions only.

### 12. Permission and system states

- Operators can use the operations workspace, search, Tags, profile, and assigned-shift editing; they cannot access Settings.
- Unauthorized Settings navigation shows a permission-denied screen and Back to operations.
- Disabled users see a disabled-account login state.
- Previous shifts are read-only; upcoming shifts remain read-only until Handover.
- Loading uses restrained skeleton rows.
- Error states preserve entered form data and offer Retry.
- Offline state blocks new submission, preserves the draft visually, and explains that reconnection is required.

## Responsive behavior

- Desktop uses the selected administration sidebar, wide table, and right inspector.
- Tablet collapses lower-priority table columns and keeps row selection plus inspector.
- Mobile shows list rows instead of a wide table; filters open in a sheet; inspectors and dialogs use the full available width.
- All primary controls remain reachable by keyboard and touch without horizontal page scrolling.

## Accessibility

- WCAG 2.2 AA is the baseline.
- Semantic headings, labels, tables/lists, dialogs, and native form controls are required.
- Visible keyboard focus and logical focus return are required.
- Dialogs trap focus and restore it to the invoking control.
- Status changes and toasts use appropriate live regions.
- Color never communicates role, status, permission, or errors by itself.
- Interactive targets meet at least the 24 px WCAG minimum and prefer 44 px for frequent touch actions when layout permits.

## Prototype verification

- Administrator can move from operations to every Settings section and back.
- Add/edit/disable/reset user interactions work with confirmations and mock state updates.
- Shift creation/editing demonstrates 24-hour coverage validation and overnight handling.
- Tag, Security, Retention, and Audit interactions work with realistic mock feedback.
- Administrator and Operator login paths visibly differ.
- Search filters and result navigation work.
- Entry attribution and revision history are reviewable.
- Permission, expired-session, disabled-account, empty, loading, error, and offline states are reachable.
- Desktop and narrow responsive layouts are rendered and checked.
- No serif font appears anywhere.
- Existing daily canvas, Tags, To-do list, Follow, attachments, and Handover behavior remain intact.

## Approval boundary

Approval of this document authorizes completion of the interactive React prototype only. Production implementation remains a separate future phase requiring its own plan and explicit approval.
