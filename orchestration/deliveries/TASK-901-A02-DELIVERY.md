---
schema: nighty.delivery/v1
task_id: TASK-901
task_revision: 1
attempt: A02
run_id: f4806e64-b6a8-469a-8c73-5cfce04242b3
status: DELIVERED
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
delivered_commit: UNCOMMITTED
branch: codex/orchestration-foundation
created_by: deepseek
created_at: 2026-11-14T20:15:00+04:00
---

# TASK-901 A02 delivery

## Implementation summary

A02 addresses all actionable changes in the A01 independent review. A01 artifacts are preserved; the A01 delivery digest remains `26e5f5b08afbd6759a8ecdd6ec9d813706ccfefa46a6fd03f9322a7468ca81c4`, matching the A01 review's `delivery_sha256`.

1. **Provider process ownership is persisted at process start.**
   `runOwnedProcess` invokes a synchronous `onStarted` callback immediately after spawn, before stdin or timers. `ProcessStartIdentity` carries the run ID, root PID, and start time. `CodexAdapter` forwards the callback. The reconciler's `ArtifactProducer` contract now receives `onProcessStarted`, and dispatch wires it to `StateStore.attachOwnedProcess`, which transactionally updates both the RUNNING run and its unreleased lease and appends an `OWNED_PROCESS_ATTACHED` event. If ownership recording throws, `runOwnedProcess` terminates the owned family and rejects with `ProcessOwnershipError`; dispatch also fails closed when a producer returns without recording ownership.

2. **Owned descendants are tracked while the root is alive, and normal exit cleans them.**
   A non-blocking Windows monitor snapshots the fixed process table at a bounded interval and records descendants while the root runs. Normal close, timeout, and output overflow all feed known descendants into the cleanup path. Cleanup now kills every still-live candidate as a tree root, records candidate/signalled/remaining/ignored PIDs, verifies absence within `cleanupTimeoutMs`, and rejects a normally exiting successful root with `ProcessCleanupError` if a descendant remains. The new Windows regression uses a detached grandchild that survives a root exit 0; the grandchild is proven dead before the result returns.

3. **Adapter paths are contained before any read, delete, spawn, or write.**
   `assertPathInsideProject` resolves both schema and output paths against `projectRoot`, rejects equal/outside/absolute escapes, and rejects existing reparse ancestors through `assertControlArtifactPath`. `CodexAdapter.run` performs this validation first, then uses only the validated paths. Outside-root victims remain byte-identical in tests, including junction-based attempts.

4. **Exact task content is bound into review and checkpoint authority.**
   Reviews now require `task_sha256` (exact SHA-256 of the task file bytes). Review ingestion compares it to the current task and rejects mismatches. Checkpoint recomputes it, compares the review field, passes it to `createApprovalBinding`, and verifies it again through `verifyCheckpointIntegrity`. The reviewer dispatch prompt includes the required task digest. A post-review task mutation regression proves checkpoint refusal while remaining `APPROVED`.

5. **A02 evidence and status are accurate.**
   `PROJECT_STATUS.md`, `TASK_STATUS.json`, and the runner README now describe A02 and retain the honest list of unaccepted ORCH criteria. No commit, merge, push, deployment, install, live provider invocation, credential request, or Nighty application work occurred.

## Files created

- `orchestration/deliveries/TASK-901-A02-DELIVERY.md` (this report)

A01 report and A01 review were not modified.

## Files modified

- `orchestration/runner/src/process-supervisor.ts`
- `orchestration/runner/src/codex-adapter.ts`
- `orchestration/runner/src/bounded-io.ts`
- `orchestration/runner/src/state-store.ts`
- `orchestration/runner/src/protocol.ts`
- `orchestration/runner/src/approval.ts`
- `orchestration/runner/src/reconciler.ts`
- `orchestration/runner/schemas/review.schema.json`
- `orchestration/runner/test/process-supervisor.test.ts`
- `orchestration/runner/test/codex-adapter.test.ts`
- `orchestration/runner/test/state-store.test.ts`
- `orchestration/runner/test/protocol.test.ts`
- `orchestration/runner/test/approval.test.ts`
- `orchestration/runner/test/reconciler.test.ts`
- `orchestration/runner/README.md`
- `orchestration/status/PROJECT_STATUS.md`
- `orchestration/status/TASK_STATUS.json`

No application source was added or modified. A01 files remain as delivered and reviewed.

## Requirement mapping

| A01 review actionable change | Implementation | Regression coverage |
|---|---|---|
| 1. Persist provider root PID synchronously; callback from supervisor through adapter/producer into transactional run+lease update; fail closed and terminate family on ownership failure | `ProcessStartIdentity`, `runOwnedProcess.onStarted`, `CodexAdapter.onProcessStarted`, `ArtifactProducer.onProcessStarted`, `StateStore.attachOwnedProcess`, dispatch checks | `state-store.test.ts` transactional run/lease update, different-PID and non-RUNNING rejection; `process-supervisor.test.ts` callback identity and ownership-failure family cleanup; `codex-adapter.test.ts` forwarding; `reconciler.test.ts` ownership recorded and missing-ownership fail-closed |
| 2. Track descendants while root alive; bounded evidenced cleanup on normal exit as well as timeout/overflow; real Windows root-exit-0/grandchild-alive regression | Async process-table monitor, tracked descendants, multi-target taskkill, normal-exit verification, `ProcessCleanupError` | `process-supervisor.test.ts`: detached grandchild survives root exit 0 and is dead before result; existing timeout and overflow family tests still pass |
| 3. Validate output/schema paths inside `projectRoot` before read/delete/spawn/write; reject reparse ancestors; outside-root victims untouched | `assertPathInsideProject`, adapter validation ordering | `codex-adapter.test.ts`: outside-root output and schema victims unchanged and fake CLI not spawned; junction schema/output paths rejected |
| 4. Bind exact task content to review/checkpoint authority; post-review mutation regression | `task_sha256` in review schema/protocol, `ApprovalBinding`, `ObservedCheckpoint`, review ingestion, checkpoint, reviewer prompt | `approval.test.ts` task-digest drift; `protocol.test.ts` task digest required/mismatch; `reconciler.test.ts` review ingestion and checkpoint after task mutation |
| 5. Preserve A01 artifacts and review; produce A02 report; no commit/merge/push/deploy/live providers | A01 digests verified unchanged; A02 report; status updates | Artifact hashes checked independently; no Git commit created |

## Tests actually executed

All commands were run from `E:\Nighty\.worktrees\orchestration-foundation`. Git-dependent commands used the exact provided executable directory on `PATH`:

`C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\native\git\cmd`

RED runs before the corresponding A02 implementation:

- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "provider root ownership|provider ownership recording" orchestration/runner/test/state-store.test.ts` → exit 1 (`attachOwnedProcess is not a function`).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "owned root pid|ownership recording throws" orchestration/runner/test/process-supervisor.test.ts` → exit 1 (missing `ProcessOwnershipError`/`onStarted` behavior).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "forwards the provider process start" orchestration/runner/test/codex-adapter.test.ts` → exit 1 (callback not forwarded).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "records provider process ownership|does not record process ownership" orchestration/runner/test/reconciler.test.ts` → exit 1 (callback absent; no fail-closed enforcement).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "outlives a normally exiting root" orchestration/runner/test/process-supervisor.test.ts` → exit 1 (cleanup `undefined`; grandchild not handled).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "outside projectRoot|reparse-point paths" orchestration/runner/test/codex-adapter.test.ts` → exit 1 (paths accepted/deleted outside root).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "identity and digest drift" orchestration/runner/test/approval.test.ts` → exit 1 (task digest not bound).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "task content mutated after review" orchestration/runner/test/reconciler.test.ts` → exit 1 (checkpoint accepted mutated task).

GREEN focused runs were executed after each implementation and exited 0, including:

- `process-supervisor.test.ts` → 8 passed, 0 failed.
- `reconciler.test.ts` → 15 passed, 0 failed.
- `state-store.test.ts` → focused ownership tests passed.
- `codex-adapter.test.ts` → focused ownership/path tests passed.
- `approval.test.ts` → focused approval tests passed.

Final gates:

- `npm run typecheck` → exit 0.
- `npm test` → exit 0: 115 tests, 115 passed, 0 failed.
- `npm run check` → exit 0: typecheck plus 115 tests, 0 failed.
- `git diff --check` → intermediate run exit 2 (extra blank lines at EOF in three files); after correction, exit 0.
- Ad-hoc artifact validation → the A02 report parsed with `parseMarkdownArtifact`, passed `validateDelivery` for `TASK-901` revision 1 attempt `A02`, and passed the tightened delivery JSON schema.
- `orchestration/status/TASK_STATUS.json` → parsed as valid JSON after removing a PowerShell-introduced BOM.
- Git emitted LF-to-CRLF working-copy warnings only; no whitespace errors remained.

## Known issues

- No live Codex adapter or DeepSeek development invocation was run. The A01 review was an independent Codex review outside the runner.
- The foreground watcher/polling loop and activation pilot remain unimplemented ORCH work.
- Windows descendant discovery uses a bounded polling window while the root is alive. A descendant that appears after the final poll and outlives the root could escape discovery; the recorded root PID and cleanup evidence remain explicit.
- The asynchronous process-table snapshot is bounded at 1.5 seconds per poll. If PowerShell is slow, descendant discovery can lag, and close waits for the in-flight poll before deciding cleanup.
- Descendant PID reuse between observation and termination is not authenticated by process start time; cleanup could target a reused PID in a pathological race.
- Localized `taskkill` success output could reduce parsed evidence, though known-descendant tracking and candidate verification still bound cleanup.
- A forced cleanup failure/retry path and a real runner-crash injection remain unexercised.
- A01 review artifacts predate the required `task_sha256` review field; they are preserved as historical evidence and are not re-validated by the tightened schema.
- The review ingestion path requires the task file to exist and be readable; a missing task throws instead of selecting a recovery state.

## Deviations

- A02 changes the review schema by requiring `task_sha256`. Historical A01 review files without that field are intentionally preserved but would fail the new schema if re-ingested.
- The schema-level `bad-task-digest` rejection and protocol task-digest mismatch assertions were added during the same task-content change and were not each observed in a separate RED run; the approval and reconciler task-digest regressions were observed RED first.
- The descendant monitor is Windows-specific; POSIX normal-exit cleanup uses the existing process-group check and group kill.
- A PowerShell rewrite introduced a UTF-8 BOM into four edited text files (including `codex-adapter.ts` and `TASK_STATUS.json`). BOMs were removed, then typecheck, the full suite, whitespace checks, delivery validation, and JSON parsing were rerun successfully.
- No commit, merge, push, deployment, service, scheduler, package installation, credential use, or live provider invocation occurred. Git was used only from the supplied executable.

## Dependencies

- Node.js 24.4.0 and npm 11.15.0, already installed.
- Supplied Git 2.56.0.windows.4 executable.
- Windows `taskkill.exe` and PowerShell (`Get-CimInstance`) for process-family evidence.
- No npm package or external tool was installed.

## Security notes

- Provider root ownership is recorded in the state authority before work proceeds; ownership failure terminates the family.
- Normal exit no longer permits a known descendant to keep running unnoticed; the result is withheld until cleanup evidence is verified.
- Adapter schema/output paths cannot escape `projectRoot`, cannot equal the root, and cannot traverse existing reparse points. Validation occurs before reads, deletes, spawns, or writes.
- Exact task bytes are bound into review and approval authority, so post-review task mutation invalidates checkpoint.
- No credential was requested, read, displayed, persisted, or fabricated. Tests use synthetic, non-key-shaped values.
- No full ambient environment is passed to provider, verification, or Git subprocesses.
- No destructive Git command, commit, push, merge, deployment, service, or scheduled task was created.

## Unresolved Windows coverage

- Non-English `taskkill` output.
- A genuine cleanup failure that survives the retry/verification window.
- Real runner-crash injection while a provider family is alive.
- Descendant PID-reuse race.
- Descendants that appear after the last monitor poll and outlive the root.
- Exotic reparse tags other than symlinks and junctions.
- Windows service or scheduled-task behavior (out of scope).

## Completion statement

TASK-901 attempt A02 is `DELIVERED` for independent review. The A01 review's four technical actionable changes are implemented with regression coverage, A01 artifacts and the review remain preserved, `npm run check` exits 0 with 115 passing tests, and `git diff --check` exits 0. No approval, checkpoint, commit, deployment, or activation is claimed.
