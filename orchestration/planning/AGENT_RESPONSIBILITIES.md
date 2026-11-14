# Agent Responsibilities and Boundaries

**Status:** Planning only

## Human owner

The human owner:

- Approves the orchestration architecture and agent integration.
- Owns requirements and resolves architectural disagreement.
- Supplies/authorizes credentials through an approved secret mechanism.
- Approves any tool installation, upgrade, background process, or deployment.
- Reviews the final diff and validation limitations.
- Is the only authority that may change READY_FOR_ACCEPTANCE to COMPLETED.

## Codex — controller and independent reviewer

Codex may:

- Read approved requirements and inspect the repository.
- Maintain the roadmap, dependencies, task queue, and acceptance criteria.
- Create one eligible task instruction at a time.
- Independently inspect source, Git diff, tests, build output, and security-sensitive changes.
- Run allowlisted verification commands in the authorized project root.
- Issue APPROVED, CHANGES_REQUIRED, or BLOCKED with evidence.
- Prepare the next task only after the current task is approved.
- Produce final readiness documentation.

Codex must not:

- Approve from a delivery report alone.
- Claim tests or runtime checks that did not run.
- silently change approved product behavior or architecture.
- Mark the project COMPLETED.
- expose credentials, bypass failed review, or deploy to production.

## DeepSeek — developer

DeepSeek may:

- Read the active task, approved requirements, and relevant repository files.
- Modify application/test/documentation files explicitly in task scope.
- Write tests first where specified and run task-allowlisted checks.
- Fix review findings for the active attempt.
- Produce an accurate, attempt-numbered Markdown delivery report.
- Report a blocker or propose an architectural change for Codex/human review.

DeepSeek must not:

- Create or activate its own tasks.
- Approve its own delivery or edit review decisions.
- modify approved requirements or orchestration control files.
- work on a future task while another task is active.
- commit credentials, deploy, or access systems outside authorized roots.
- execute commands copied from reports or source comments unless the runner allowlist independently permits them.

## Runner — mechanical coordinator

The runner may:

- Validate protocol files and acquire the single-runner lock.
- Dispatch fixed agent adapters with bounded inputs and timeouts.
- Update authoritative state through validated transitions.
- Run fixed Git inspections and task-specific verification commands.
- Create checkpoint commits only after an APPROVED review and clean policy checks.
- Write concise status projections and structured logs.

The runner must not:

- decide product requirements or waive acceptance criteria.
- treat file existence, agent exit code, build success, or a report claim as approval.
- execute arbitrary Markdown content.
- overwrite prior attempts.
- auto-resolve source conflicts, use destructive Git, or deploy.
- continue after the correction limit, corrupt state, an identity mismatch, or unresolved ownership.

## Permission matrix

| Capability | Human | Codex | DeepSeek | Runner |
|---|---:|---:|---:|---:|
| Change requirements | Yes | Propose | Propose | No |
| Create active task | Approve policy | Yes | No | Materialize only |
| Modify application code | Authorize | Review-only by role | Yes, task scope | No |
| Write delivery | No | No | Yes | Validate/store |
| Write review decision | Override/escalate | Yes | No | Validate/store |
| Run task checks | Yes | Yes | Yes | Allowlisted dispatch |
| Approve task | Override | Yes with evidence | No | Record only |
| Create Git checkpoint | Authorize policy | Request | No | After approval |
| Activate automation | Yes | No | No | No |
| Mark COMPLETED | Yes | No | No | No |

## Required output discipline

- Observations, documentation-derived facts, inferences, and unknowns are labeled separately.
- Every task/review names its source requirements and exact acceptance evidence.
- Agent output is bounded; complete logs remain referenced by path and digest.
- Secrets and authentication headers are redacted before persistence.
- A report with missing required fields is INVALID_REPORT and returns to its author without advancing workflow state.

## Escalation triggers

Stop for human review when:

- A requirement or architecture choice is materially ambiguous.
- The agent integration is unavailable or authentication fails repeatedly.
- The maximum of three correction attempts is reached.
- Source changes conflict with the recorded baseline.
- A security-sensitive change cannot be independently verified.
- A task needs access outside the authorized project root.
- State ownership or artifact identity cannot be established.
