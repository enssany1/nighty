---
schema: nighty.review/v1
task_id: TASK-901
task_revision: 1
attempt: A02
run_id: 81f77396-c967-4d50-bd8e-c770cf274954
decision: CHANGES_REQUIRED
reviewed_by: codex
created_at: 2026-11-14T20:22:00+04:00
delivery_sha256: 806f8783dc652fc69ec3cf47e481f3ca3e186352b0d0b10e0aafa8e847a7f2e8
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
head_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
branch: codex/orchestration-foundation
source_sha256: c51f066692570a9ff6c46a9f78a36bb8b267a1e5738dc7470ea478fb1cc3a905
tree_sha256: 27152b7e7d43a2e7b4010ec5d1e77ce5c434fa99cd26a3bd79535739ddd1fcb6
task_sha256: 8a2cc7d72189e0381419569434ef929b7f464968d99097765155bc5cb86a550a
mandatory_criteria_verified: false
---

# TASK-901 A02 independent review

## Decision

CHANGES_REQUIRED. The four A01 safety areas are substantially improved and the reported 115-test gate reproduces, but the provider ownership callback is not integrated through the actual adapter/producer boundary.

## Independent inspection

- A01 delivery SHA-256 still equals `26e5f5b08afbd6759a8ecdd6ec9d813706ccfefa46a6fd03f9322a7468ca81c4`.
- A02 delivery SHA-256 independently equals `806f8783dc652fc69ec3cf47e481f3ca3e186352b0d0b10e0aafa8e847a7f2e8`.
- Codex inspected the supervisor, state transaction, adapter containment, task-digest authority, reconciler dispatch, and their focused regressions.

## Requirement-by-requirement findings

`ArtifactProducer.run` receives `onProcessStarted` per invocation from both reconciler dispatch paths, but `CodexAdapter.run` does not accept or forward that input callback. Instead it only forwards `CodexAdapterOptions.onProcessStarted`, which is fixed at construction. A `CodexAdapter` used directly as the reconciler producer therefore ignores the reconciler callback, leaves the run PID null, and fails only after the provider has finished. The existing adapter test exercises only the constructor callback, while the reconciler tests use synthetic producers, so the cross-boundary defect is not covered.

This leaves A01 actionable change 1 incomplete: the PID callback is present in each isolated layer but is not connected across the real adapter/producer seam.

The other three A01 technical corrections are implemented with focused regression evidence: normal-exit descendant cleanup, adapter path containment, and exact task-content authority.

## Tests independently executed

- `npm run check` exited 0: TypeScript passed and 115 tests passed with zero failures.
- `git diff --check` exited 0 with line-ending warnings only.

## Security/architecture review

The disconnected ownership callback is an ownership-boundary defect rather than a documentation omission. A real provider process would run without its PID being persisted in the reconciler's run and lease, defeating crash recovery until the invocation returned and was rejected. Normal-exit cleanup, path containment, task digest binding, bounded reads, state transactions, redaction, and approval integrity remain directionally sound.

## Actionable changes

1. Make `CodexAdapter.run` accept the per-run `onProcessStarted` callback and forward that callback to `runOwnedProcess` (constructor-level fallback may remain only for compatibility).
2. Add a RED-then-GREEN integration regression that uses a real `CodexAdapter` as an `ArtifactProducer` through `Reconciler.dispatchDevelopment`, proving the state run and lease receive the spawned PID before provider work completes.
3. Preserve A01/A02 artifacts and reviews. Produce `TASK-901-A03-DELIVERY.md` with exact evidence. Do not commit, merge, push, deploy, install, invoke a live provider, or start Nighty application work.

Verified A02 corrections:

- Normal successful exit performs bounded cleanup for an observed surviving Windows grandchild, and the regression proves it dead before return.
- `StateStore.attachOwnedProcess` transactionally updates the RUNNING run and live lease, and ownership-write failure terminates the process family.
- Schema and output paths are contained inside `projectRoot` and reject reparse ancestors before mutation or read.
- Exact task bytes are bound by `task_sha256` through review ingestion, approval, and checkpoint; mutation after review is rejected.

## Limitations/unverified coverage

No live provider was invoked. The bounded Windows polling race, PID reuse, localized `taskkill` output, forced cleanup failure/retry, real runner-crash injection, foreground watcher/polling loop, and activation pilot remain explicitly unverified later acceptance work.

## Next transition

Return TASK-901 to READY_FOR_CORRECTION for A03. Do not checkpoint A02.
