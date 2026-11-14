# TASK-008 atomic manual Handover checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** 87b4207

## Outcome

Nighty now performs manual Handover in a serializable transaction, closes the current shift, opens the ordered successor, transfers every open Follow exactly once, exposes incoming Follow items on the next canvas, and supports accountable Follow completion.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the handover service did not exist and concurrent route calls returned 404.
- GREEN: the focused date-boundary test and two PostgreSQL integration workflows pass, including concurrent requests and last-shift rollover.

## Verification

- `npm test -w @nighty/api -- handover` -> exit 0, 1 passed.
- `npm run test:integration -w @nighty/api -- handover.concurrency-spec.ts` -> exit 0, 2 passed.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Handover uses persisted Active/Upcoming state and never compares the wall clock with scheduled hours.
2. Current and successor rows are locked and changed inside a serializable transaction.
3. Provider-specific PostgreSQL serialization errors are normalized at the database boundary and retried; the losing concurrent request becomes a safe idempotent response.
4. Follow transfers use a database unique key and `skipDuplicates`; To-do and Update entries are never selected.
5. The final shift materializes the next operational day and opens its first ordered shift.
6. Follow completion requires the receiving active shift and updates both transfer and source-entry status with audit evidence.

## Limitations

The UI Handover confirmation and incoming-Follow rendering are implemented in TASK-013. No incoming-shift acknowledgement workflow is introduced.
