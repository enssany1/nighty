---
schema: nighty.review/v1
task_id: TASK-901
task_revision: 1
attempt: A03
run_id: 0e33098b-710c-4f3b-a722-245ddf487312
decision: APPROVED
reviewed_by: codex
created_at: 2026-11-14T20:56:00+04:00
delivery_sha256: c9050975135686bbe68d75cf6b20d23012df741c094a3c393392107a63030fab
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
head_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
branch: codex/orchestration-foundation
source_sha256: edc648f2d8bb0077222fc629f87f05e2a7e3c7bbb894bfd74ef59f5356c35855
tree_sha256: 110ca07dbd93f457f06f5ac4c51edf3c876a71cd3aaab4e62a6452a56fb56577
task_sha256: 8a2cc7d72189e0381419569434ef929b7f464968d99097765155bc5cb86a550a
mandatory_criteria_verified: true
---

# TASK-901 A03 independent review

## Decision

APPROVED. A03 closes the remaining A02 ownership-integration defect and strengthens the regression evidence without weakening any A01/A02 safety correction.

## Independent inspection

Codex inspected the actual adapter and reconciler boundary, the strengthened real-process regression, A03 delivery, status projections, preserved A01/A02 artifacts, and the complete uncommitted source inventory. The real `CodexAdapter` is now used directly as the reconciler's `ArtifactProducer`; no wrapper supplies the missing behavior.

## Requirement-by-requirement findings

1. The invocation-scoped `onProcessStarted` callback is accepted by `CodexAdapter.run` and forwarded to `runOwnedProcess`; the constructor callback remains only a compatibility fallback.
2. The strengthened Windows integration test blocks the provider before output, proves the RUNNING run and live lease hold the same actual spawned provider PID, then releases it and proves completion and lease release.
3. A01/A02 delivery and review artifacts remain preserved. A03 accurately reports no net production change beyond Codex's reviewed correction.
4. The earlier normal-exit descendant cleanup, ownership transaction, adapter path containment, and exact task-content authority remain covered and passing.
5. Status projections no longer overstate ORCH plan-task acceptance or activation readiness.

## Tests independently executed

- `npm run check` -> exit 0; TypeScript passed and 116 tests passed with zero failures.
- `git diff --check` -> exit 0; line-ending warnings only.
- The A03 delivery SHA-256 was independently computed as `c9050975135686bbe68d75cf6b20d23012df741c094a3c393392107a63030fab`.
- The strengthened test's cleanup path was inspected: its `finally` release prevents a blocked fixture from surviving an assertion failure.

## Security/architecture review

Provider ownership now crosses the actual adapter/producer seam before provider work can complete, so crash recovery has the root PID on both authoritative records. Fail-closed ownership recording, process-family cleanup, path containment, bounded reads, credential redaction, task/review binding, and checkpoint integrity remain intact. No credential, live provider, deployment, or application mutation was involved.

## Actionable changes

None for TASK-901 A03. The remaining ORCH acceptance criteria are separate planned work and must not be represented as accepted by this review.

## Limitations/unverified coverage

No live provider was invoked through the runner. The foreground watcher/polling loop, localized `taskkill` output, forced cleanup-failure retry, PID-reuse race, real runner-crash injection, full ORCH fault matrix, and activation pilot remain unverified. These limitations are explicit in the A03 delivery and status projections and do not invalidate the scoped TASK-901 correction.

## Next transition

Checkpoint TASK-901 A03 on `codex/orchestration-foundation` with the exact reviewed inventory. Then continue the remaining ORCH acceptance work; do not begin Nighty application TASK-001 until the runner reaches its activation gate.
