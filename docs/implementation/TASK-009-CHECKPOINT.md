# TASK-009 Tag whiteboards and attachments checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** ee9a778

## Outcome

Nighty now provides editable/reorderable/archivable Tag whiteboards with newest-first posts plus bounded authenticated attachment storage for inline pasted images and ordinary files.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: Tag and attachment services were absent and all post/upload routes returned 404.
- GREEN: three focused normalization/sniffing tests, two adversarial upload tests, and one full Tag lifecycle workflow pass.

## Verification

- `npm test -w @nighty/api -- tags attachments` -> exit 0, 3 passed.
- `npm run test:integration -w @nighty/api -- uploads.security-spec.ts` -> exit 0, 2 passed.
- Tag integration covers stable reorder, rename uniqueness, newest-first order, archive history, and in-use deletion prevention.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Tag names are normalized once and case-insensitive collisions are rejected.
2. Reordering uses temporary collision-free positions; archived Tags remain readable and reject new posts.
3. Storage keys are random 256-bit hex values independent of the display filename.
4. Display filenames drop both POSIX and Windows path components and control characters.
5. Server-side byte signatures own MIME type; declared mismatches, unsupported content, non-image inline disposition, empty files, and oversized files fail.
6. Upload writes a bounded temporary file, persists digest/metadata, then atomically renames; a failed rename retains a database-owned recoverable temporary path.
7. Downloads require a valid Nighty session and verify the stored SHA-256 digest before returning content.

## Limitations

Attachment garbage collection follows record retention in TASK-011. The UI paste-versus-attach experience is completed in TASK-013.
