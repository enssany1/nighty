# Nighty orchestration runner foundation

This directory contains the safety foundation for the local Codex/DeepSeek workflow. It is **not activated**. ORCH-001 through ORCH-009 meet their technical acceptance criteria. ORCH-010's deterministic one-correction foreground pilot and real-provider proofs are complete, while human evidence sign-off and the separate activation decision remain open. See `orchestration/status/PROJECT_STATUS.md` and `orchestration/acceptance/LIVE_PROVIDER_EVIDENCE.md`.

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
- Isolated, runner-owned DeepSeek `CODEX_HOME`; the credential is only read from the execution environment and is never written to configuration. The profile disables the shell tool, leaving command execution to the sealed verification registry.
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

Run `npm run check` from the repository root. The Git-backed tests require the configured Git executable to be available. The latest full run passed 142 orchestration tests plus every production workspace test. Live synthetic provider evidence is recorded separately and does not run as part of the deterministic suite.

## Activation status

Live synthetic DeepSeek and Codex invocations have been observed in disposable repositories outside Nighty. The DeepSeek desktop Harness is not an authorized runner because its fresh session launched full-access and ignored a project-local shell override. Only the isolated runner-owned profile may be used for the developer role. Human ORCH-010 sign-off and activation remain separate explicit decisions; the foreground runner stays inactive.
