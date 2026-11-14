# TASK-007 shift canvas entries and revisions checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 989f7d1

## Outcome

Nighty now reads complete operational-day canvases and supports the exact Update, To-do list, and Follow taxonomy with bounded editor JSON validation, server-owned plain text, active-shift permissions, independent To-do toggles, edit revisions, attribution, and audit events.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: editor and entry owners were absent and all canvas/entry routes returned 404.
- GREEN: three focused editor/To-do boundary tests and three PostgreSQL canvas workflow tests pass.

## Verification

- Additive assignment-snapshot backfill migration deployed without modifying the already-applied table migration.
- `npm test -w @nighty/api -- entries` -> exit 0, 3 passed.
- `npm run test:e2e -w @nighty/api -- canvas.e2e-spec.ts` -> exit 0, 3 passed.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Unsupported editor nodes and marks fail at the owning boundary with bounded depth, node count, and text size.
2. Plain text is derived from validated editor JSON and cannot be forged by the browser.
3. Blank To-do rows are removed, positions are rebuilt, and an empty list is rejected.
4. Only an Active shift is writable; administrators may write it globally, while operators require the immutable assignment snapshot.
5. Closed and Upcoming shifts are read-only independently of wall-clock time.
6. Every edit stores the previous document and text in a numbered revision in the same transaction.

## Limitations

Open Follow transfer and completion are owned by TASK-008. Tag/attachment behavior is owned by TASK-009.
