---
schema: nighty.review/v1
task_id: TASK-901
task_revision: 1
attempt: A01
run_id: b36b8a45-7e64-4f70-9c1f-d8cc2df3b9ab
decision: CHANGES_REQUIRED
reviewed_by: codex
created_at: 2026-11-14T20:15:00+04:00
delivery_sha256: 26e5f5b08afbd6759a8ecdd6ec9d813706ccfefa46a6fd03f9322a7468ca81c4
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
head_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
branch: codex/orchestration-foundation
source_sha256: 84589adc3bb58652a1dcc9ae4f2ad6340e51a696a7e31ae0eaafcd2a890114fa
tree_sha256: ae639cc4048d95701085a0e7a0ff710ad83b149dbb220cf00a92ab58b7dfa820
mandatory_criteria_verified: false
---

# TASK-901 A01 independent review

## Decision

CHANGES_REQUIRED. The foundation is materially improved and its reported final gates reproduce, but four fail-closed boundaries remain incomplete.

## Independent inspection

Codex inspected the actual uncommitted diff, the A01 delivery report, approval/recovery/state/process boundaries, and the updated status projections. Codex independently ran `npm run check` with the supplied Git executable and observed 104 passing tests with zero failures. Codex independently ran `git diff --check` and observed exit 0 with line-ending warnings only.

## Requirement-by-requirement findings

1. Process-family cleanup remains incomplete after a successful root-process exit. `runOwnedProcess` starts cleanup only for timeout or output overflow. A provider can spawn a background descendant, exit successfully, release its lease, and leave that descendant able to continue writing.
2. Integrated ownership is not established for the actual provider process. Both reconciler dispatch paths call `beginRun` with `pid: null`, and the producer contract has no process-start callback. After a runner crash, the database cannot prove whether the root or descendants remain alive; the optional `producerDescendantAlive` hook is not composed by default.
3. `CodexAdapter.run` calls `rmSync(input.outputPath, { force: true })` before proving the caller-supplied output path is within the project/control-artifact boundary. The schema path is also not project-contained. A direct caller can delete or read an arbitrary accessible path.
4. The approval source inventory explicitly excludes `orchestration/tasks/`, while the approval binding contains no task-content digest. Task instructions can therefore change without a revision bump and without invalidating the reviewed source digest.

## Tests independently executed

- `npm run check` -> exit 0; TypeScript passed; 104 tests passed, 0 failed.
- `git diff --check` -> exit 0; no whitespace errors.
- Delivery SHA-256 independently computed as `26e5f5b08afbd6759a8ecdd6ec9d813706ccfefa46a6fd03f9322a7468ca81c4`.
- Git inspection independently captured branch, HEAD, source digest, and exact changed-source inventory recorded in this review front matter.

## Security/architecture review

The state, schema, redaction, bounded-read, verification-registry, and checkpoint changes are directionally sound. The remaining gaps are ownership-boundary defects, not documentation issues: a descendant can outlive an apparently successful run; a crash loses process identity; an adapter mutation can escape the repository; and reviewed authority is not cryptographically tied to the task content.

## Actionable changes

1. Persist the provider root PID synchronously at process start. Add a process-start callback from `runOwnedProcess` through `CodexAdapter`/the producer contract into a transactional `StateStore` method that updates both the RUNNING run and its live lease. Fail closed and terminate the family if ownership recording fails.
2. Track owned descendants while the root is alive and perform bounded, evidenced cleanup on normal exit as well as timeout/overflow. Add a real Windows regression where the root exits 0 while its grandchild remains alive; the grandchild must be dead before the process result is returned.
3. Resolve and validate output and schema paths inside `projectRoot` before any read, delete, spawn, or write. Reject ancestor reparse points. Add outside-root tests proving a victim file is untouched.
4. Bind the exact task content to review/checkpoint authority. Either include task documents in the source inventory or add a task SHA-256 field to review and approval bindings. Add a post-review task-mutation regression.
5. Preserve the A01 report and this review. Produce `TASK-901-A02-DELIVERY.md` with exact RED/GREEN and final-gate evidence; do not commit, merge, push, deploy, or run live providers.

## Limitations/unverified coverage

No live provider was invoked. Localized `taskkill` output, forced cleanup failure/retry, and real runner-crash injection remain unverified and must stay explicit. The foreground watcher/polling loop and activation pilot remain later ORCH acceptance work.

## Next transition

Return TASK-901 to READY_FOR_CORRECTION for attempt A02. Do not checkpoint A01.
