# TASK-011 search and retention lifecycle checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** fe628e8

## Outcome

Nighty now provides indexed multi-filter entry search with stable canvas destinations and a two-phase permanent retention lifecycle that marks database ownership before file deletion, retains partial failures, retries safely, and reports audit summaries.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: search and retention owners were absent and the failure integration suite could not load its cleanup token.
- GREEN: four focused boundary/failure tests, two indexed search workflows, and one real file-failure/retry workflow pass.

## Verification

- Additive retention state and PostgreSQL trigram/cursor indexes migration deployed successfully.
- `npm test -w @nighty/api -- search retention` -> exit 0, 4 passed.
- `npm run test:integration -w @nighty/api -- retention.failure-spec.ts` -> exit 0, 1 passed.
- Search integration covers all approved filters, no-result state, cursor paging, stable IDs, and index presence.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Search filters server-owned plain text, operational date, author, definition, Tag, action type, and Follow status without reparsing rendered HTML.
2. Results carry operational date, shift instance ID, entry ID, author, timestamp, text, and Tags for stable navigation/highlighting.
3. Ordering is deterministic by timestamp then UUID, with a bounded opaque cursor and maximum page size of 50.
4. Preview uses strict `operationalDate < cutoff` and never mutates records.
5. Cleanup marks each day before touching files, deletes only validated database-owned storage keys, and deletes the database parent only after every final/temporary file is absent.
6. Database marking failure performs no file operation. File or finalization failure retains a FAILED parent for retry; missing files are idempotent success on retry.
7. Each run writes an immutable summary audit event.

## Limitations

Retention execution is an explicit administrator command in V1. No unattended scheduler is activated. Tag whiteboard posts are outside handover-record retention.
