# Nighty orchestration runner foundation

This directory contains the tested safety foundation for the local Codex/DeepSeek workflow.

Implemented boundaries:

- Markdown artifact identity and required-section validation.
- Atomic same-directory publication with SHA-256 conflict detection.
- SQLite task state with compare-and-swap transitions and one active task.
- Bounded allowlisted child processes with timeout, stdin, and output limits.
- Schema-constrained Codex controller invocation.
- Isolated DeepSeek provider configuration using DEEPSEEK_API_KEY; the key is never written to configuration.
- Git baseline/approval digest gates.
- Named immutable verification commands.
- Fail-closed restart decisions.

Run npm run check from the repository root.

## Current activation blocker

No DeepSeek credential exists at process, user, or machine scope. The runner must not substitute another provider. Once the human owner supplies DEEPSEEK_API_KEY through an approved transient environment, the remaining disposable pilot must verify:

1. isolated CODEX_HOME;
2. DeepSeek provider/model identity;
3. an in-scope test-first edit in a disposable repository;
4. denial of out-of-root edits and unregistered commands;
5. delivery report identity versus the actual Git diff;
6. credential absence from files, logs, command arguments, and Git.

Only after that pilot passes may Nighty application TASK-001 begin.
