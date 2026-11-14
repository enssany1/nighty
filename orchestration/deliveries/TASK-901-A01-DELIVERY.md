---
schema: nighty.delivery/v1
task_id: TASK-901
task_revision: 1
attempt: A01
run_id: d54f2db3-faeb-4150-8cff-c94fc760820b
status: DELIVERED
baseline_commit: 32ba1371cce294bb18a71ac6eeab2ed06d4c2949
delivered_commit: UNCOMMITTED
branch: codex/orchestration-foundation
created_by: deepseek
created_at: 2026-11-14T20:00:00+04:00
---

# TASK-901 delivery

## Implementation summary

Implemented the integrated, fail-closed orchestration runner foundation requested by TASK-901, preserving all existing commits and tests. No commit, merge, push, deployment, service, scheduled task, or Nighty application work was performed.

The hardening is organized into focused modules and wired through a foreground reconciler:

- Bounded I/O: `bounded-io.ts` checks metadata before allocation, rejects invalid UTF-8 with a fatal decoder, rejects non-regular files, and rejects control-artifact reparse points (including junctions).
- Untrusted Markdown: `markdown.ts` parses front matter and level-two sections, ignores headings inside fences, rejects control characters, duplicates, malformed front matter, and oversized input.
- Local schema validation: `schema.ts` implements the JSON-Schema subset used by the repository, fails closed on unsupported keywords, and validates Codex/DeepSeek structured results locally. Task, delivery, and review schemas were tightened, including `additionalProperties: false`.
- Process cleanup: `process-supervisor.ts` records owned root and observed descendant PIDs, terminates the family with `taskkill /T /F` on Windows (process group on POSIX), verifies absence within a bounded deadline, and returns structured cleanup evidence. Grandchild processes are exercised by real regression tests.
- Redaction: `redaction.ts` removes the explicit credential value, its JSON-escaped form, and its URI-encoded forms from captured output, adapter errors, process cleanup failures, and persisted state reasons. Structured output containing the credential is deleted and rejected.
- State ownership: `state-store.ts` adds revision identity, attempts, runs, leases, expired-lease supersession, explicit ownership release, and `HUMAN_REVIEW`. Ownership remains active through `APPROVED` and `CHECKPOINTED` until an audited release.
- Approval integrity: `approval.ts` binds task/revision/attempt, delivery digest, review digest, branch, baseline/head/tree, reviewed source digest, inventory digest, and the exact source inventory. `Reconciler.checkpoint()` re-reads artifacts, re-inspects Git, and applies the binding immediately before `CHECKPOINTED`.
- Recovery: `recovery.ts` never validates a delivery while the owned producer or a reported descendant is alive, advances an already-recorded delivery once, and routes conflicts, exhaustion, and human-review waits explicitly.
- Reconciler: `reconciler.ts` composes the inbox, state, recovery, verification, Git, and injected artifact producers; it covers rename-before-database-record, recorded-but-not-advanced delivery, live-producer waiting, duplicate suppression, conflict quarantine, invalid/oversized artifacts, review ingestion, bounded task prompts, and checkpoint gating.
- DeepSeek isolation: `deepseek-profile.ts` prepares an isolated runner-owned `CODEX_HOME`, requires no credential to prepare configuration, rejects shared/ambient user configuration, and keeps an allowlisted environment.
- Verification: `verification-registry.ts` supports sealing, immutable command registration, required-command finalization, and fail-closed reports.
- Status correction: `PROJECT_STATUS.md`, `TASK_STATUS.json`, and the runner README no longer label unit-tested primitives as accepted plan tasks and no longer claim the missing credential is the only blocker.

## Files created

- `orchestration/runner/src/bounded-io.ts`
- `orchestration/runner/src/markdown.ts`
- `orchestration/runner/src/schema.ts`
- `orchestration/runner/src/redaction.ts`
- `orchestration/runner/src/approval.ts`
- `orchestration/runner/src/reconciler.ts`
- `orchestration/runner/test/support.ts`
- `orchestration/runner/test/git-support.ts`
- `orchestration/runner/test/bounded-io.test.ts`
- `orchestration/runner/test/markdown.test.ts`
- `orchestration/runner/test/schema.test.ts`
- `orchestration/runner/test/redaction.test.ts`
- `orchestration/runner/test/approval.test.ts`
- `orchestration/runner/test/reconciler.test.ts`
- `orchestration/deliveries/TASK-901-A01-DELIVERY.md` (this report)

## Files modified

- `.gitignore`
- `orchestration/runner/README.md`
- `orchestration/runner/schemas/task.schema.json`
- `orchestration/runner/schemas/delivery.schema.json`
- `orchestration/runner/schemas/review.schema.json`
- `orchestration/runner/src/process-supervisor.ts`
- `orchestration/runner/src/state-store.ts`
- `orchestration/runner/src/artifact-inbox.ts`
- `orchestration/runner/src/recovery.ts`
- `orchestration/runner/src/git-gate.ts`
- `orchestration/runner/src/protocol.ts`
- `orchestration/runner/src/codex-adapter.ts`
- `orchestration/runner/src/deepseek-profile.ts`
- `orchestration/runner/src/verification-registry.ts`
- `orchestration/runner/test/process-supervisor.test.ts`
- `orchestration/runner/test/state-store.test.ts`
- `orchestration/runner/test/artifact-inbox.test.ts`
- `orchestration/runner/test/recovery.test.ts`
- `orchestration/runner/test/protocol.test.ts`
- `orchestration/runner/test/codex-adapter.test.ts`
- `orchestration/runner/test/deepseek-profile.test.ts`
- `orchestration/runner/test/verification-registry.test.ts`
- `orchestration/status/PROJECT_STATUS.md`
- `orchestration/status/TASK_STATUS.json`

No application source was added or modified.

## Requirement mapping

| TASK-901 in-scope requirement | Implementation | Regression coverage |
|---|---|---|
| 1. Windows process-family cleanup with owned PID evidence, bounded cleanup, structured result, real grandchild tests | `process-supervisor.ts` | `process-supervisor.test.ts`: timeout family cleanup, output-overflow family cleanup, real grandchild PIDs verified dead, structured `cleanup` evidence |
| 2. Approval integrity across task/revision/attempt, delivery/review digests, baseline/head/branch, source/tree inventory, clean inventory before checkpoint | `approval.ts`, `reconciler.checkpoint`, `git-gate.ts` | `approval.test.ts` (mutation, extra inventory, branch/head/baseline, identity/digest drift, tampered approval); `reconciler.test.ts` checkpoint success and post-review source/inventory mutation |
| 3. Ownership active through `CHECKPOINTED`, revision identity, attempts/runs/leases, `HUMAN_REVIEW` without silent release | `state-store.ts` | `state-store.test.ts`: active-through-checkpoint, explicit release, `HUMAN_REVIEW` ownership, revision events, attempts/runs/leases, concurrent lease claim, expired supersession |
| 4. Foreground reconciler composing inbox, state, recovery, verification, Git, adapters; crash gap, concurrent duplicates, conflict quarantine | `reconciler.ts` | `reconciler.test.ts`: rename-before-DB record, recorded-before-state, duplicate suppression, conflict quarantine, invalid UTF-8, review ingestion, injected producers, verification environment; `state-store.test.ts` concurrent duplicate |
| 5. Bound task prompt, Markdown, structured-output, existing-file reads; reject invalid UTF-8 and reparse points | `bounded-io.ts`, `markdown.ts`, `artifact-inbox.ts`, `reconciler.ts`, `codex-adapter.ts` | `bounded-io.test.ts`, `markdown.test.ts`, `reconciler.test.ts` prompt bounds and junction, `codex-adapter.test.ts` prompt/schema/output bounds, `protocol.test.ts` reparse path |
| 6. Redact explicit credential from captured errors/output before persistence | `redaction.ts`, process/adapter/state/reconciler wiring | `redaction.test.ts`, `codex-adapter.test.ts` error and structured-output rejection, `state-store.test.ts` persisted event reason |
| 7. Recovery never validates while owned producer or descendant is alive | `recovery.ts`, `reconciler.ts` | `recovery.test.ts` live producer and live descendant; `reconciler.test.ts` live producer waits then validates after exit |
| 8. Locally validate schema-constrained Codex/DeepSeek results; tighten schemas | `schema.ts`, schemas, `codex-adapter.ts` | `schema.test.ts`, `codex-adapter.test.ts` valid/invalid tightened results, unknown-field rejection, invalid UTF-8 |
| 9. Dedicated runner-owned DeepSeek `CODEX_HOME`; no secret required or displayed | `deepseek-profile.ts` | `deepseek-profile.test.ts`: no-credential preparation, reparse rejection, shared/out-of-root/ambient rejection, allowlisted environment |
| 10. Seal/finalize the verification registry | `verification-registry.ts` | `verification-registry.test.ts`: sealed registration, required-command finalize, unrun/failed/unknown, timeout, pre-seal failure |
| 11. Correct status documents; list remaining acceptance criteria | `PROJECT_STATUS.md`, `TASK_STATUS.json`, README | Document review only; no automated assertion |

## Tests actually executed

All test commands were run from `E:\Nighty\.worktrees\orchestration-foundation`. Git-dependent commands used the provided executable directory on `PATH`:

`C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\native\git\cmd`

RED runs (before the corresponding implementation):

- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/bounded-io.test.ts orchestration/runner/test/markdown.test.ts orchestration/runner/test/schema.test.ts orchestration/runner/test/redaction.test.ts` → exit 1 (`ERR_MODULE_NOT_FOUND` for new modules).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/process-supervisor.test.ts` → exit 1 (missing `ProcessOutputLimitError` export).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/recovery.test.ts` → exit 1 (live-producer and human-review decisions mismatched).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/state-store.test.ts` → exit 1 (missing revision/attempt/run APIs).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/approval.test.ts` → exit 1 (`ERR_MODULE_NOT_FOUND` for `approval.ts`).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/verification-registry.test.ts` → exit 1 (`seal`/`finalize` absent).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/codex-adapter.test.ts orchestration/runner/test/deepseek-profile.test.ts` → exit 1 (missing local schema/redaction/CODEX_HOME behavior).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/reconciler.test.ts` → exit 1 (`ERR_MODULE_NOT_FOUND` for `reconciler.ts`).
- `node --disable-warning=ExperimentalWarning --test orchestration/runner/test/protocol.test.ts` → exit 1 (tightened identity assertions absent).
- `node --disable-warning=ExperimentalWarning --test --test-name-pattern "redact the explicit" orchestration/runner/test/state-store.test.ts` → exit 1 (credential persisted in event reason).

GREEN focused runs were executed for each suite after implementation, each exit 0.

Final gates:

- `npm run typecheck` → exit 0.
- `npm test` → exit 0: 104 tests, 104 pass, 0 fail.
- `npm run check` → exit 0: typecheck plus 104 tests, 104 pass, 0 fail.
- `git diff --check` → intermediate runs exit 2 (first: trailing whitespace in three `PROJECT_STATUS.md` header lines; second: extra blank lines at EOF in two test files); after correction, exit 0.
- Git reported LF-to-CRLF working-copy warnings only; `git diff --check` reported no whitespace errors.

## Known issues

- No live Codex review or DeepSeek development invocation was run. Adapter behavior is proven only with disposable local fixtures.
- The foreground runner loop (filesystem watcher plus 30-second polling) is not implemented or activated; `Reconciler.reconcileOnce()` is callable and tested.
- Process-family verification depends on Windows `taskkill /T` output and PowerShell CIM enumeration. The `taskkill` line parser matches the English "process with PID" form; fully localized output could reduce evidence, though the captured descendant snapshot and root verification still bound cleanup.
- Cleanup-failure retry was not induced end to end. Structured `remainingPids`, `deadlineExceeded`, and `failures` make failure visible, but no test forces a surviving workload process.
- Descendant liveness beyond the recorded root PID must be supplied through `producerDescendantAlive`; the reconciler's default check covers the recorded lease PID.
- `StateStore.recordArtifact` converts a SQLite unique-constraint error by matching the error text; this passed concurrent tests but is coupled to SQLite's message.
- `prepareRunnerCodexHome` rejects any ambient `CODEX_HOME` that differs from the runner home. This is deliberately fail-closed and may require clearing `CODEX_HOME` in an environment where it is set.
- Git-backed tests require Git on `PATH` or `NIGHTY_GIT_EXECUTABLE`. The final commands used the provided path, not an installation.
- Status files are hand-corrected projections, not generated by a running projection service.

## Deviations

- Strict test-first order was not observed for four test groups that were added immediately after their implementation existed: artifact quarantine, reconciler developer/reviewer producer dispatch, reconciler checkpoint gating, and structured-output credential rejection. Their RED runs are therefore not claimed. Every other new focused group was observed RED first. All groups are GREEN in the final run.
- Before the user supplied the existing Codex runtime Git executable, a portable MinGit archive was downloaded to a user-local tools directory. On instruction it was removed immediately, and all subsequent Git work used only the exact provided executable. No repository content, credential, commit, or configuration was affected.
- `HUMAN_REVIEW` was added to the state machine and `CHECKPOINTED`/`APPROVED` were made ownership-retaining states, as required by this task; this changes the previous state map.
- The review schema was intentionally tightened to require baseline/head/branch/source/tree evidence; older review fixtures without those fields would now fail schema validation.
- Git source inventory intentionally excludes runner-owned control paths (`orchestration/deliveries`, `reviews`, `status`, `quarantine`, `logs`, `archive`, `tasks`) so that producing a review does not invalidate the source digest it approves. The inventory comparison remains exact for source files.
- Added optional `NIGHTY_GIT_EXECUTABLE` support so the provided Git can be selected without installation.

## Dependencies

- Node.js 24.4.0 and npm 11.15.0, as already installed.
- The provided Git 2.56.0.windows.4 executable.
- Windows `taskkill.exe` and PowerShell (`Get-CimInstance`, `Get-Process`) for process-family evidence; no package was installed.
- No DeepSeek credential was requested, read, displayed, persisted, or fabricated.
- No new npm dependency was added.

## Security notes

- The explicit credential value is never included in this report, arguments, fixtures, configuration, or event history. Tests use clearly synthetic values.
- Redaction covers raw, JSON-escaped, and URI-encoded forms in captured output, adapter error messages, cleanup failures, and persisted state reasons. Structured output containing the credential is deleted and rejected.
- Control artifacts are read with size bounds before allocation, strict UTF-8 decoding, regular-file checks, and reparse-point rejection. Markdown and model output are treated as data only; no report-supplied command is executed.
- Child processes receive explicit environments, not ambient inheritance. Git and verification subprocesses use allowlisted environments; verification commands are sealed and named.
- No destructive Git command was run. No commit, merge, push, deploy, service, or scheduled task was created.
- Process cleanup uses fixed internal `taskkill`/PowerShell commands; no agent-controlled input other than validated numeric PIDs is interpolated.
- Reparse-point detection covers symbolic links and junctions as exposed by Node. Other reparse tags are not distinguishable through the Node filesystem API and remain a documented limitation.

## Unresolved Windows coverage

- Localized (non-English) `taskkill` success output was not exercised.
- A genuine cleanup failure that leaves a workload process alive was not induced or retried.
- Runner termination during an active owned process (real process crash) was not exercised; logic is unit-tested, not crash-injected.
- Reparse points other than symlinks/junctions (for example some cloud-filter or mount-point tags) were not exercised.
- No Windows service or scheduled-task behavior was tested; both are out of scope for this task.

## Remaining acceptance criteria

TASK-901 is delivered for independent review, not approved. The following are not claimed:

- Independent Codex review of this delivery and the actual diff.
- Checkpoint commit creation by the authorized reviewer process.
- Any live DeepSeek or Codex invocation.
- Full ORCH-001 through ORCH-010 acceptance (enumerated in `PROJECT_STATUS.md` and `TASK_STATUS.json`).
- Activation, pilot approval, or Nighty application TASK-001.

## Completion statement

TASK-901 attempt A01 is DELIVERED with `npm run check` exiting 0 and 104 tests passing. The worktree is uncommitted by design; `git diff --check` exits 0. No acceptance or checkpoint is claimed. Independent Codex review is required before any checkpoint decision.
