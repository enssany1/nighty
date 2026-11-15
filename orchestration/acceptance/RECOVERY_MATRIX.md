# ORCH-009 recovery matrix

This matrix maps every recovery scenario in `AUTOMATED_WORKFLOW.md` to an
executable acceptance test. The SQLite store remains authoritative; no test
reconstructs or overwrites missing/corrupt authority silently.

| Scenario | Executable evidence | Required outcome |
|---|---|---|
| Runner restarts during development | `process-recovery.test.ts` — exact persisted provider process | Resume observation or terminate only the proven-owned process; no blind redispatch. |
| Delivery exists while state is IN_DEVELOPMENT | `reconciler.test.ts` — delivery renamed before DB record / state gap | Record and advance exactly once. |
| Reviewer crashes | `reconciler.test.ts` — reviewer crash preserves delivery | Preserve delivery, create a new reviewer run ID, never approve the failed run. |
| Git diff differs from approval | `approval.test.ts` and `reconciler.test.ts` — checkpoint mutation cases | Refuse checkpoint and keep APPROVED ownership. |
| Corrupt/missing state database | `state-store.test.ts` — existing-state fail-closed cases | Throw, preserve bytes, and never create a replacement through the recovery API. |
| JSON/Markdown projection missing | `acceptance-foundation.test.ts` — projection regeneration | Regenerate from SQLite without driving state. |
| Atomic rename fails | `artifact-inbox.test.ts` — injected rename failure | Expose no final artifact; a later atomic retry succeeds. |
| Provider unavailable | `reconciler.test.ts` — producer/ownership failure cases | Record EXECUTION_FAILED while retaining task ownership and source/artifacts. |
| Verification command times out | `verification-registry.test.ts` — timed-out required check | Reality is FAILED/UNVERIFIED and cannot be claimed PASSED. |
| Maximum corrections reached | `reconciler.test.ts` — correction attempt boundary | A fourth attempt is not dispatched; state becomes HUMAN_REVIEW. |
| Duplicate checkpoint request | `reconciler.test.ts` — checkpoint integrity case | The first request creates one commit; the second is rejected by state. |

Live-provider availability, secret scanning, and a complete correction cycle are
ORCH-006/ORCH-010 pilot evidence and are intentionally not inferred from this
deterministic fault suite.
