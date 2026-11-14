# Nighty Project Status

**Updated:** 14 November 2026, 20:58 +04

**Phase:** Orchestration foundation hardening (TASK-901)

**State:** ORCHESTRATION_ACCEPTANCE_PENDING

**Progress:** TASK-901 A03 independently approved and checkpointed; 0 of 10 ORCH plan tasks accepted because their remaining acceptance criteria are still explicit below.

## Correction of the previous status

The previous revision of this file labeled ORCH-001 through ORCH-009 as "Completed and checkpointed" and described the missing DeepSeek credential as the only blocker. That was not supported by evidence. Those items were isolated, unit-tested primitives; no integrated foreground runner, independent review, or checkpoint had been exercised. `TASK_STATUS.json` has been corrected to match.

Two distinct things remain true:

1. The missing credential is **not** the only blocker. ORCH-005, ORCH-007, ORCH-008, ORCH-009, and ORCH-010 still have unexercised acceptance criteria (listed below), and the runner has never been activated.
2. Isolated primitives now have substantially broader regression coverage after TASK-901, but coverage is not the same as plan-task acceptance.

## TASK-901 status

- A01 was independently reviewed as `CHANGES_REQUIRED` in `orchestration/reviews/TASK-901-A01-REVIEW.md`.
- A02 was independently reviewed as `CHANGES_REQUIRED` in `orchestration/reviews/TASK-901-A02-REVIEW.md`: the reconciler supplied ownership per run, but `CodexAdapter` ignored that invocation callback.
- A03 confirms Codex's local adapter forwarding correction, strengthens the real-adapter/reconciler regression to prove the run and lease PID (and the actual spawned provider PID) before provider completion, and is independently `APPROVED` in `orchestration/reviews/TASK-901-A03-REVIEW.md`.
- The exact reviewed TASK-901 inventory is checkpointed on `codex/orchestration-foundation`. No merge, push, deployment, service, or scheduled task was created.
- A live Codex or DeepSeek invocation was **not** run.
- A01/A02 deliveries and reviews are preserved.

## Implemented and unit-tested under TASK-901

- A03 adapter integration: a real `CodexAdapter` used directly as the reconciler's `ArtifactProducer` persists the actual spawned provider PID on both the RUNNING run and live lease before provider completion. Codex's per-run forwarding correction is reproduced RED then GREEN.
- A02 provider ownership: the root PID is recorded transactionally on the RUNNING run and live lease through a synchronous process-start callback; ownership failure terminates the family.
- A02 descendant containment: owned descendants are tracked while the root is alive and bounded, evidenced cleanup also runs after a normal exit; the grandchild must be dead before the result returns.
- A02 adapter path containment: output and schema paths are proved inside `projectRoot` with reparse-ancestor rejection before any read, delete, spawn, or write.
- A02 task authority: exact task SHA-256 is required in reviews and approval bindings, verified during review ingestion and again at checkpoint.
- Bounded, strict-UTF-8 control-artifact reads with reparse-point rejection and pre-allocation size checks.
- Markdown front-matter/section parsing that ignores fenced headings and rejects malformed input.
- Local JSON-Schema-subset validation with fail-closed unsupported keywords; tightened task, delivery, and review schemas.
- Windows process-family cleanup with owned root/descendant PID evidence, bounded cleanup, structured cleanup evidence, and real grandchild regression tests.
- Approval binding across task/revision/attempt, delivery digest, review digest, branch, baseline/head/tree, reviewed source and inventory digests, and exact inventory comparison immediately before checkpoint.
- State ownership retained through APPROVED, CHECKPOINTED, and HUMAN_REVIEW; explicit audited ownership release; attempts, runs, leases, revision changes, and expired-lease supersession.
- Foreground reconciler covering rename-before-database-record, delivery-record-before-state-advance, live-producer safety, duplicate suppression, conflict quarantine, review ingestion, checkpoint gating, and injected development/review producers.
- Bounded task-prompt reads, invalid-UTF-8 rejection, and control-artifact reparse-point rejection.
- Credential redaction in captured process output, adapter errors, persisted state reasons, and rejected structured output.
- Verification-registry sealing and fail-closed finalization.
- Dedicated runner-owned DeepSeek `CODEX_HOME` preparation that requires no credential and rejects shared/ambient user configuration.

## ORCH plan tasks not accepted

| Task | Current state | Remaining acceptance criteria |
|---|---|---|
| ORCH-001 | Implemented primitives | Complete deterministic valid/invalid fixture matrix; explicit proof that existing files are never overwritten; no-agent-invocation evidence. |
| ORCH-002 | Implemented primitives | Restart-preservation test across a reopened database; generated status projections; concurrent owner/lease evidence integrated with the runner. |
| ORCH-003 | Implemented primitives | Filesystem watcher wakeups and 30-second full polling loop; partial-file and rename-race acceptance run; conflict quarantine exercised through the foreground runner. |
| ORCH-004 | Implemented primitives | Runner-crash cleanup test; explicit cleanup-failure retry path; late-output case; heartbeat wired from the supervisor into production dispatch. |
| ORCH-005 | Implemented primitives | Disposable real Codex task and review invocation; auth-failure behavior; review evidence capture; controller cannot approve without evidence fields in a real run. |
| ORCH-006 | Partially implemented, blocked | Live DeepSeek disposable pilot has not run; model-identity proof; denial of out-of-root edits and unregistered commands; secret-absence scan after a live run. |
| ORCH-007 | Implemented primitives | Actual checkpoint commit creation (runner intentionally does not commit); commit-failure handling; pre-existing-branch and dirty-baseline acceptance run. |
| ORCH-008 | Implemented primitives | Delivery-report-versus-actual-result comparison; argument-injection regression; report cannot expand the command allowlist in an integrated run. |
| ORCH-009 | Partially implemented | Full fault-injection/restart matrix from `AUTOMATED_WORKFLOW.md`; correction-limit integration; no-duplicate-checkpoint proof end to end. |
| ORCH-010 | Not started | Foreground pilot, human observation, artifact/state/log/secret review, and explicit activation decision. |

## Verification evidence

- `npm run typecheck`: exit 0.
- `npm test`: 116 tests passed, 0 failed as part of the final `npm run check`.
- `npm run check`: exit 0 (typecheck plus 116 tests).
- `git diff --check`: exit 0.
- Git was supplied through the exact provided executable directory, not installed.

## Known limitations

- No live Codex adapter or DeepSeek development invocation occurred; adapter behavior was exercised only with disposable local fixtures. The independent A01 review was performed by Codex outside the runner.
- The foreground runner loop (watcher plus polling) is not activated; the reconciler is callable and tested.
- Localized Windows `taskkill` output and a forced cleanup-failure retry remain unexercised; cleanup evidence records `remainingPids`, `deadlineExceeded`, and `failures`.
- Windows descendant liveness is tracked by a bounded polling window while the root is alive; a descendant that both survives and starts after the final poll could escape discovery. The recorded run/lease PID and cleanup evidence remain explicit.
- Task-content authority is a SHA-256 of the exact task file; changing task contents without a revision bump is rejected at review ingestion and checkpoint.
- No live provider ever handled a credential during this task; redaction was proven with synthetic values only.

## Next required action

Complete and independently accept the remaining ORCH-001 through ORCH-010 criteria, including the foreground disposable provider pilot and recovery matrix. Nighty application TASK-001 must not start until the runner reaches its activation gate.
