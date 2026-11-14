---
schema: nighty.delivery/v1
task_id: TASK-901
task_revision: 1
attempt: A03
run_id: 031daf2f-220e-4248-a6a0-ba35626c071c
status: DELIVERED
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
delivered_commit: UNCOMMITTED
branch: codex/orchestration-foundation
created_by: deepseek
created_at: 2026-11-14T20:50:00+04:00
---

# TASK-901 A03 delivery

## Implementation summary

I inspected `TASK-901-A02-REVIEW.md`, the current uncommitted adapter correction, and the full reconciler test file. The A02 finding is correct: `CodexAdapter.run` now accepts `input.onProcessStarted` and forwards it to `runOwnedProcess`, with the constructor-level callback retained only as a fallback.

I did not assume the regression was adequate. The existing integration test used a wrapper producer and polled only the run PID; it did not prove the live lease received the PID, that the PID belonged to the actual spawned provider, or that ownership was recorded before provider completion. A03 replaces that regression with one that:

- uses the real `CodexAdapter` directly as the reconciler's `ArtifactProducer`;
- blocks the fake provider on a release file so completion is test-controlled;
- proves the RUNNING run PID and the live lease PID match before release;
- proves the recorded PID equals the fake provider's own `process.pid`;
- proves the structured output does not yet exist and the provider is still blocked;
- releases the provider, awaits dispatch, and verifies `WAIT`, `COMPLETED`, lease release, and output presence.

The production adapter correction itself was already correct; A03 made no net production-code change. The remaining issue was incomplete integration evidence, which is now covered. I re-observed RED by temporarily removing the per-run forwarding, confirmed the strengthened test failed with a null run PID, restored the forwarding exactly, and confirmed GREEN.

A01/A02 preservation:

- `TASK-901-A01-DELIVERY.md` SHA-256 remains `26e5f5b08afbd6759a8ecdd6ec9d813706ccfefa46a6fd03f9322a7468ca81c4`.
- `TASK-901-A02-DELIVERY.md` SHA-256 remains `806f8783dc652fc69ec3cf47e481f3ca3e186352b0d0b10e0aafa8e847a7f2e8`, matching the A02 review.
- A01/A02 reviews were not modified.

## Files created

- `orchestration/deliveries/TASK-901-A03-DELIVERY.md` (this report)

## Files modified

- `orchestration/runner/test/reconciler.test.ts` — strengthened the real-adapter integration regression.
- `orchestration/status/PROJECT_STATUS.md` — A03 delivered, awaiting independent review.
- `orchestration/status/TASK_STATUS.json` — A03 DELIVERED, reviewPending true.

The A03-only production files (`orchestration/runner/src/codex-adapter.ts`) were reviewed and temporarily mutated for the RED check, then restored byte-for-byte to Codex's correction; A03 introduces no net production-code change.

## Requirement mapping

| A02 review actionable change | A03 response | Evidence |
|---|---|---|
| 1. `CodexAdapter.run` accepts the per-run `onProcessStarted` and forwards it; constructor fallback only for compatibility | Inspected the correction; confirmed `input.onProcessStarted ?? options.onProcessStarted` is passed as `onStarted` | `codex-adapter.ts`; RED/GREEN integration test |
| 2. RED-then-GREEN integration regression using a real `CodexAdapter` as `ArtifactProducer` through `Reconciler.dispatchDevelopment`, proving run and lease receive the spawned PID before provider completion | Replaced wrapper-only, run-only polling with direct adapter, lease assertion, actual provider PID comparison, and release-file completion barrier | `reconciler.test.ts`: "reconciler persists the real provider run and lease PID before provider completion" |
| 3. Preserve A01/A02; produce A03 evidence; no commit/merge/push/deploy/live provider/application work | A01/A02 hashes verified unchanged; this report; status updated | Hash checks; Git state |

## Tests actually executed

All commands were run from `E:\Nighty\.worktrees\orchestration-foundation` with the exact provided Git directory on `PATH`:

`C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\native\git\cmd`

Already-observed RED from Codex (recorded in the A02 review/status): the pre-A03 real-adapter/reconciler regression failed before the adapter correction because the state run PID remained null. The pre-A03 test was named `reconciler persists ownership through a real Codex adapter before provider completion`; the matching focused command was:

`node --disable-warning=ExperimentalWarning --test --test-name-pattern "persists ownership through a real Codex adapter" orchestration/runner/test/reconciler.test.ts`

→ observed failing before the adapter fix (null run PID).

A03 re-observed RED with the strengthened test after temporarily removing the per-run forwarding:

`node --disable-warning=ExperimentalWarning --test --test-name-pattern "real provider run and lease PID" orchestration/runner/test/reconciler.test.ts`

→ exit 1 in 5.1 s: `AssertionError: provider run PID must be persisted while the adapter is running`.

GREEN after restoring the forwarding:

`node --disable-warning=ExperimentalWarning --test --test-name-pattern "real provider run and lease PID" orchestration/runner/test/reconciler.test.ts`

→ exit 0: 1 test passed, 0 failed.

Final gates:

- `npm run typecheck` → exit 0.
- `npm test` → exit 0: 116 tests, 116 passed, 0 failed.
- `npm run check` → exit 0: typecheck plus 116 tests, 0 failed.
- `git diff --check` → exit 0 with LF-to-CRLF warnings only.
- A03 delivery parsed with `parseMarkdownArtifact`, passed `validateDelivery` for `TASK-901` revision 1 attempt `A03`, and passed the delivery JSON schema.
- `TASK_STATUS.json` parsed as valid JSON.

## Known issues

- No live Codex or DeepSeek provider was invoked. The fake provider is a local Node fixture.
- The foreground watcher/polling loop and activation pilot remain unimplemented ORCH work.
- Windows descendant tracking retains its bounded polling race; localized `taskkill` output, forced cleanup failure/retry, PID reuse, and real runner-crash injection remain unverified.
- The A03 integration test uses a local release-file barrier and a fake schema; it proves the ownership seam, not real provider behavior.
- Codex's exact historical shell argv is not persisted in the repository; the report records the matching pre-A03 selector and the exact A03 re-observation command.

## Deviations

- A03 makes no net production-code change. Codex's adapter fix was correct; the correction is a stronger regression plus delivery/status evidence.
- RED was re-observed by temporarily removing the existing per-run forwarding and then restoring it. This is a controlled mutation check, not the original historical TDD order.
- The strengthened test uses the real `CodexAdapter` directly as `ArtifactProducer`; no wrapper producer is used.
- No commit, merge, push, deployment, service, scheduler, install, credential use, or live provider invocation occurred.

## Dependencies

- Node.js 24.4.0 and npm 11.15.0, already installed.
- The supplied Git 2.56.0.windows.4 executable.
- Windows `taskkill.exe` and PowerShell for the supervisor path exercised by the integration test.
- No package or external tool was installed.

## Security notes

- The ownership callback is invocation-scoped and reaches the supervisor through the real adapter; the run and live lease carry the same actual provider PID before provider completion.
- No credential was requested, read, displayed, persisted, or fabricated. Fixtures use synthetic values.
- No full ambient environment, destructive Git, commit, push, merge, deployment, service, scheduled task, or application work occurred.
- A01/A02 deliveries and reviews are preserved unchanged.

## Completion statement

TASK-901 attempt A03 is `DELIVERED` for independent Codex review. Codex's adapter forwarding correction is confirmed; the integration regression now proves the real provider PID reaches both the run and live lease before provider completion; `npm run check` exits 0 with 116 passing tests; `git diff --check` exits 0. No approval, checkpoint, commit, or activation is claimed.
