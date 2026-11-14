# Nighty Orchestration Architecture

**Status:** Planning only — not implemented or activated  
**Date:** 14 November 2026  
**Target root:** `E:\Nighty`

## Existing project assessment

`E:\Nighty` exists and was empty at inspection time: zero files, no Git repository, no application source, no tests, and no orchestration mechanism. The approved interactive design and production plan currently exist outside that root in the Codex visualization workspace. They are source material, not evidence of a production application in `E:\Nighty`.

Verified local tools:

- Codex CLI `0.154.0`, authenticated through ChatGPT, with noninteractive `exec` and `review` commands.
- Node.js `24.4.0`, npm `11.15.0`, Git `2.56.0.windows.4`, and Docker `29.6.1`.
- No `deepseek` command and no `DEEPSEEK_API_KEY` in the inspected process environment.

## Recommended architecture

Use one supervised Windows runner process with a single active task. The runner coordinates files, agents, Git, and verification but does not interpret Markdown as executable shell instructions.

```text
Human approval
      |
      v
Project controller (Codex adapter) <----> Reviewer output schema
      ^                                      |
      |                                      v
Runner/reconciler ---> State store ---> Shared folder protocol
      |                    |                 |
      v                    v                 v
Developer adapter     event/audit log    tasks/deliveries/reviews
(DeepSeek)                 |
      |                    v
      +------------> Git workspace + allowlisted verification
```

### Components

1. **Runner/reconciler**
   - A foreground Node.js/TypeScript console application for V1.
   - Uses filesystem notifications for responsiveness and a 30-second polling reconciliation pass for recovery.
   - Acquires one project-wide ownership lock before processing.
   - Handles only one development task at a time.

2. **Authoritative state store**
   - SQLite is recommended for atomic transitions, leases, attempt history, and restart recovery.
   - `TASK_STATUS.json` is a generated human-readable projection, never the transition authority.
   - Every transition records task, attempt, previous state, new state, timestamp, reason, and artifact digest.

3. **Shared-folder protocol**
   - Immutable task instructions per task revision.
   - Attempt-numbered delivery and review documents; previous attempts are never overwritten.
   - Temporary files are validated and atomically renamed into place.

4. **Codex controller adapter**
   - Runs Codex noninteractively with a fixed working directory, JSONL event capture, an output schema, timeout, and explicit sandbox/approval policy.
   - Creates tasks and reviews, but approval is accepted only after independent source and test verification.

5. **DeepSeek developer adapter**
   - Recommended feasibility path: an isolated Codex CLI configuration using DeepSeek as the model provider, so DeepSeek has a controlled coding harness rather than unrestricted custom command execution.
   - This path is not ready: current DeepSeek documentation requires Codex `0.164+`; the installed CLI is `0.154.0`, and an API credential is absent.
   - No provider substitution is permitted.

6. **Workspace and Git gate**
   - Rejects dirty or conflicting baselines before dispatch.
   - Records baseline and delivered commit/diff identities.
   - Creates a sequential checkpoint only after APPROVED.
   - Never runs destructive Git commands automatically.

7. **Verification gate**
   - Runs only command templates registered for the active task.
   - Captures exit code, duration, bounded output, and environment metadata.
   - A delivery report cannot add executable commands to the allowlist.

8. **Status and logging**
   - Updates `PROJECT_STATUS.md` after meaningful state transitions.
   - Keeps structured execution logs separate from concise human reports.
   - Redacts configured secrets and never logs authentication tokens.

## Ownership and trust boundaries

- The human owns requirements, architecture approval, orchestration activation, blocked decisions, and final COMPLETED status.
- Codex owns task definition, review, acceptance evidence, and READY_FOR_ACCEPTANCE recommendation.
- DeepSeek owns implementation and delivery reporting but cannot approve its own work or alter requirements.
- The runner owns state transitions, leases, artifact validation, and process supervision; it does not own product decisions.
- Markdown, source code, model output, and delivery reports are untrusted inputs.

## Recovery model

- Every agent invocation receives a unique run ID and task attempt ID.
- A lease heartbeat distinguishes a running process from an abandoned attempt.
- On restart, the reconciler compares the state store, filesystem artifacts, Git baseline, and any recorded process result before choosing a transition.
- Duplicate artifacts with the same digest are idempotent; conflicting artifacts stop in HUMAN_REVIEW.
- A timed-out or crashed agent becomes EXECUTION_FAILED, not CHANGES_REQUIRED.
- Reviewer failure preserves DELIVERED/UNDER_REVIEW and can be retried without approving.

## Recommended V1 choices

- Foreground console runner before any Windows service or scheduled task.
- SQLite authority plus Markdown/JSON projections.
- Sequential commits on one protected development branch; no automatic merge.
- Filesystem events plus 30-second reconciliation polling.
- Three correction attempts by default; the fourth need becomes BLOCKED/HUMAN_REVIEW.
- Separate Codex reviewer and DeepSeek developer configurations and session stores.

## Approval boundary

This document does not authorize creating the runner, initializing Git, upgrading Codex, configuring DeepSeek, installing packages, importing source, or starting an agent loop.
