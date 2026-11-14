# Orchestration Implementation Plan

**Status:** PLANNED — implementation requires explicit approval  
**Goal:** Build a recoverable, single-task Windows orchestrator without modifying Nighty application behavior.

## Global restrictions

- Do not start this plan until the DeepSeek integration decision is approved.
- Test in a disposable repository before pointing any adapter at Nighty.
- Keep runner code under `E:\Nighty\orchestration\runner`; application source remains separate.
- Use test-first implementation and preserve every failed/revised attempt.
- No Windows service, scheduled task, deployment, or unattended loop until a foreground acceptance run is approved.

## ORCH-001 — Establish repository and protocol fixtures

- **Objective:** Initialize the approved Git layout and materialize schemas/examples from the planning documents.
- **Dependencies:** Human approval to initialize `E:\Nighty`; decision OD-001.
- **Implementation:** Create orchestration directories, JSON schemas, fixtures, ignore rules, and non-secret configuration example.
- **Tests:** Valid/invalid task, delivery, review, traversal, oversized artifact, duplicate identity.
- **Acceptance:** Fixtures validate deterministically; existing files are not overwritten; no agent is invoked.
- **Priority/status:** P0 / PLANNED.

## ORCH-002 — Implement authoritative state machine

- **Objective:** Own task/attempt/run transitions transactionally.
- **Dependencies:** ORCH-001; decision OD-003.
- **Implementation:** SQLite schema, compare-and-swap transitions, event history, generated Markdown/JSON projections.
- **Tests:** Legal/illegal transitions, concurrent owner claim, duplicate event, conflicting digest, projection recovery.
- **Acceptance:** Exactly one owner and active task; restart preserves state; projections never drive transitions.
- **Priority/status:** P0 / PLANNED.

## ORCH-003 — Implement atomic inbox and reconciler

- **Objective:** Detect complete artifacts without duplicate processing.
- **Dependencies:** ORCH-002.
- **Implementation:** Same-volume temp/rename protocol, watcher wakeups, 30-second full polling, quarantine.
- **Tests:** Partial file, rename race, duplicate event, restart between file and DB commit, corrupt UTF-8.
- **Acceptance:** Every valid artifact processes once; conflicts stop safely.
- **Priority/status:** P0 / PLANNED.

## ORCH-004 — Implement process supervision

- **Objective:** Launch bounded owned processes and report truthful results.
- **Dependencies:** ORCH-002.
- **Implementation:** allowlisted executable/arguments, minimal environment, stdout/stderr caps, timeout, heartbeat/lease, process-family cleanup.
- **Tests:** normal exit, nonzero exit, timeout, late output, runner crash, child process, cleanup failure.
- **Acceptance:** Ownership is established before termination; cleanup failure remains visible/retryable.
- **Priority/status:** P0 / PLANNED.

## ORCH-005 — Integrate Codex controller

- **Objective:** Create structured task/review output through verified local CLI.
- **Dependencies:** ORCH-004.
- **Implementation:** `codex exec/review` adapter, output schema, JSONL parser, context bundler, review evidence capture.
- **Tests:** mocked event streams plus disposable real CLI task/review; malformed output; auth failure.
- **Acceptance:** Controller produces valid files and cannot approve without evidence fields.
- **Priority/status:** P0 / PLANNED.

## ORCH-006 — Prove and integrate DeepSeek developer

- **Objective:** Obtain safe autonomous file editing by the named developer provider.
- **Dependencies:** OD-001/OD-002 approvals, compatible Codex version, DeepSeek credential, ORCH-004.
- **Implementation:** isolated config/session root, secure key injection, disposable repository spike, then adapter.
- **Tests:** create test+code, run allowlisted test, emit delivery; deny out-of-root edit and forbidden command; auth/quota failure.
- **Acceptance:** Model identity is verifiable, no secret persists, sandbox boundary holds, and report matches actual diff.
- **Priority/status:** P0 / BLOCKED_BY_DECISION.

## ORCH-007 — Add Git baseline and checkpoint gate

- **Objective:** Make every task traceable and prevent conflicting changes.
- **Dependencies:** ORCH-002, Git repository approval.
- **Implementation:** clean-baseline check, diff inventory, approval digest binding, sequential Conventional Commit checkpoint.
- **Tests:** dirty baseline, unrelated edit, changed approval, commit failure, pre-existing branch.
- **Acceptance:** Only an APPROVED matching attempt can checkpoint; destructive Git is absent.
- **Priority/status:** P1 / PLANNED.

## ORCH-008 — Add verification allowlist and report validators

- **Objective:** Run task checks without executing model-authored commands blindly.
- **Dependencies:** ORCH-004.
- **Implementation:** named command registry, per-task test IDs, exit/duration capture, report-vs-reality comparison.
- **Tests:** unregistered command, argument injection, timeout, false report claim, oversized output.
- **Acceptance:** Reports cannot expand authority; unrun tests remain explicitly unverified.
- **Priority/status:** P1 / PLANNED.

## ORCH-009 — Exercise failure and restart matrix

- **Objective:** Validate recovery before real project use.
- **Dependencies:** ORCH-003 through ORCH-008.
- **Implementation:** deterministic fault injection and crash/restart acceptance suite.
- **Tests:** every scenario in `AUTOMATED_WORKFLOW.md`, including correction limit and conflicting artifacts.
- **Acceptance:** No duplicate invocation/checkpoint, no silent state loss, and each failure reaches the defined state.
- **Priority/status:** P1 / PLANNED.

## ORCH-010 — Foreground pilot and activation decision

- **Objective:** Run one harmless end-to-end sample task with human observation.
- **Dependencies:** All prior tasks; explicit pilot approval.
- **Implementation:** disposable sample, controller task, DeepSeek delivery, Codex review, one requested correction, approval, checkpoint.
- **Tests:** compare artifacts, state history, Git result, logs, secret scan, restart recovery.
- **Acceptance:** Human signs off evidence and separately decides whether Nighty tasks may begin.
- **Priority/status:** P0 / PLANNED.

## Completion boundary

The runner is only READY_FOR_ACTIVATION after ORCH-001 through ORCH-010 pass. Activation against Nighty, any background scheduling, and the first application task each require explicit human approval.
