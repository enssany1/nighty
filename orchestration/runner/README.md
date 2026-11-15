# Nighty orchestration runner foundation

This directory contains the safety foundation for the local Codex/DeepSeek workflow. It is **not activated**. Deterministic acceptance is recorded for ORCH-001 through ORCH-004 and ORCH-007 through ORCH-009; live-provider criteria remain open for ORCH-005, ORCH-006, and ORCH-010. See `orchestration/status/PROJECT_STATUS.md`.

## Implemented and unit-tested

- Bounded, strict-UTF-8 control-artifact reads with size limits and reparse-point rejection.
- Markdown front-matter/section parsing; Markdown and agent output are treated as untrusted data.
- Locally validated, tightened task/delivery/review JSON schemas.
- Atomic same-directory publication with SHA-256 conflict detection and conflict quarantine.
- SQLite task state with compare-and-swap transitions, revision identity, attempts, runs, leases, and ownership retained through APPROVED, CHECKPOINTED, and HUMAN_REVIEW.
- Bounded allowlisted child processes with timeout, stdin, output limits, and Windows process-family cleanup with owned PID evidence.
- Provider root ownership persisted on the RUNNING run and live lease at process start; ownership failure terminates the family.
- Owned descendant tracking while the root is alive, with bounded evidenced cleanup after normal exit as well as timeout or output overflow.
- Schema-constrained Codex controller invocation with prompt/schema/output bounds and project-contained output/schema paths.
- Isolated, runner-owned DeepSeek `CODEX_HOME`; the credential is only read from the execution environment and is never written to configuration.
- Git baseline, source/tree inventory, exact task-content SHA-256, and approval-integrity gates immediately before checkpoint.
- Named immutable verification commands with sealing and fail-closed finalization.
- Fail-closed restart/recovery decisions that never validate an artifact while its owned producer may still be alive.
- Foreground reconciler covering crash gaps, duplicate artifacts, conflict quarantine, review ingestion, and injected development/review producers.

## Git executable

The runner invokes Git from `PATH` by default. Set `NIGHTY_GIT_EXECUTABLE` to an absolute Git executable when PATH does not expose one, for example on this machine:

```text
C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\native\git\cmd\git.exe
```

## Verification

Run `npm run check` from the repository root. The Git-backed tests require the configured Git executable to be available. A live provider run is not part of this foundation and has not been performed.

## Activation status

No live DeepSeek or Codex review invocation has been run. ORCH-005, ORCH-006, and ORCH-010 retain explicit live-provider acceptance criteria. A disposable pilot requires action-time approval before transmitting its synthetic prompt; activation remains a separate explicit decision.
