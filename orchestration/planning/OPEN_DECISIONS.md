# Open Decisions

**Status:** All listed decisions resolved under the human owner's advance implementation authorization of 14 November 2026

## OD-001 — DeepSeek execution harness (first decision)

**Decision:** **APPROVED on 14 November 2026.** The developer role will use an isolated Codex CLI harness configured with the DeepSeek model provider.

**Required boundary:** Controller and developer configuration/session roots remain separate. This decision does not authorize installing or upgrading software, configuring credentials, building the runner, or starting an agent loop.

**Reason:** The selected harness provides controlled file editing, test execution, structured output, sandboxing, and process exit behavior without building an unrestricted custom tool bridge.

**Effect:** OD-001 is closed. ORCH-006 remains blocked by the planning-only implementation boundary and its required disposable pilot.

## OD-002 — Codex upgrade and DeepSeek credential

**Decision:** **APPROVED on 14 November 2026.** The implementation may include a controlled upgrade from the installed Codex `0.154.0` to a DeepSeek-compatible version after reviewing release compatibility, plus secure DeepSeek API-key injection.

**Required boundary:** The key must not be stored in Git, Markdown, logs, task files, application `.env` files, command arguments, or the user's shared Codex configuration. Approval records the planned mechanism only; it does not yet authorize performing the upgrade, collecting/configuring the credential, or activating an agent.

**Effect:** OD-002 is closed. The compatibility and credential proof must pass in a disposable pilot before Nighty application tasks may run.

## OD-003 — Authoritative orchestration state

**Decision:** **APPROVED on 14 November 2026.** SQLite will be the transactional source of truth. `TASK_STATUS.json` and `PROJECT_STATUS.md` will be generated projections for machine interchange and human viewing; neither may drive state transitions.

**Required boundary:** The state database is local to `E:\Nighty\orchestration\status`, contains no credentials, and is accessed only through validated compare-and-swap transitions with an append-only event history. Missing or corrupt state must stop the runner rather than trigger silent reconstruction or overwrite.

**Effect:** OD-003 is closed. This approval selects the design only; no database has been created.

## OD-004 — Initialize and seed `E:\Nighty`

**Decision:** **APPROVED on 14 November 2026.** Initialize Git in `E:\Nighty`, copy approved specifications and plans into `docs/approved/`, and keep the interactive prototype source separate.

## OD-005 — Git workflow

**Decision:** Use one isolated `codex/orchestration-foundation` worktree/branch for the runner, then sequential approved task checkpoints. Do not push or merge automatically.

## OD-006 — Runtime limits and cost controls

**Decision:** 30-second reconciliation poll, one active task, three correction attempts, one automatic retry only when no source mutation occurred, 30-minute developer timeout, 15-minute reviewer timeout, and bounded 10 MiB output per run. Adjust only from measured pilot evidence.

## OD-007 — Foreground versus background operation

**Decision:** Foreground console pilot first. No Windows service or scheduled task until recovery, credentials, logs, and stop controls pass the pilot.

## OD-008 — Banking-specific controls

Nighty is approved as a general shift-operations application, not banking-only. Apply standard secure application controls. Any later connection to banking production systems, regulated records, or organization-specific retention policy requires separate scope and human security review.

**Decision:** Apply standard secure application controls only; no banking-production access is authorized.

## Decision order

1. ~~OD-001 — DeepSeek harness.~~ **Approved.**
2. ~~OD-002 — compatible Codex version and credential mechanism.~~ **Approved.**
3. ~~OD-003 — authoritative orchestration state.~~ **Approved.**
4. ~~OD-004/OD-005 — repository seeding and Git policy.~~ **Resolved.**
5. ~~OD-006/OD-007 — operational limits and activation mode.~~ **Resolved.**
6. **ORCH-001 implementation authorized on 14 November 2026; continue unattended within the recorded safety boundaries.**
