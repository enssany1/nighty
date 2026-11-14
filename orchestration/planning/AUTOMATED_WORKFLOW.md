# Automated Workflow

**Status:** Planning only — no loop has been activated

## State model

```text
PLANNED
  -> READY_FOR_DEVELOPMENT
  -> IN_DEVELOPMENT
  -> DELIVERED
  -> UNDER_REVIEW
       -> APPROVED -> CHECKPOINTED -> next eligible task
       -> CHANGES_REQUIRED -> READY_FOR_CORRECTION -> IN_DEVELOPMENT
       -> BLOCKED -> HUMAN_REVIEW

Agent/process failure -> EXECUTION_FAILED -> bounded retry or HUMAN_REVIEW
Invalid artifact      -> INVALID_REPORT   -> correction without acceptance
All tasks checkpointed -> FINAL_VERIFICATION -> READY_FOR_ACCEPTANCE
Human only             -> COMPLETED
```

## End-to-end cycle

1. **Reconcile**
   - Acquire the project lock.
   - Read authoritative state, protocol files, Git identity/status, and prior run outcome.
   - Verify there is at most one active task and one live lease.

2. **Select**
   - Codex selects the first PLANNED task whose dependencies are APPROVED.
   - The task document is validated, hashed, and moved to READY_FOR_DEVELOPMENT.

3. **Dispatch development**
   - Runner creates attempt `A01`, records the Git baseline, and invokes the approved DeepSeek adapter.
   - The invocation receives only the active task, required approved context, repository path, allowed tools, and report schema.
   - State becomes IN_DEVELOPMENT with a renewable lease.

4. **Validate delivery**
   - Agent exit success is recorded but is not acceptance.
   - Runner validates the delivery schema, task/attempt identity, artifact digest, changed-file scope, and Git status.
   - A valid report moves to DELIVERED; an invalid report becomes INVALID_REPORT.

5. **Independent review**
   - Runner invokes Codex with task, delivery, actual diff, relevant files, and verification policy.
   - Codex runs or requests independent checks and records exact results.
   - The review is attempt-numbered and schema-validated.

6. **Decide**
   - APPROVED requires all mandatory criteria and independent evidence.
   - CHANGES_REQUIRED contains ordered, actionable findings tied to criteria and creates the next attempt.
   - BLOCKED identifies the unresolved dependency and stops dispatch.

7. **Checkpoint**
   - Runner rechecks worktree identity and approval digest.
   - It creates one Conventional Commit checkpoint for the approved task under the approved Git policy.
   - Status and task projections are updated.

8. **Continue or finalize**
   - Next eligible task is prepared.
   - When none remain, Codex runs the final release gate and writes an acceptance report.
   - The highest automatic project state is READY_FOR_ACCEPTANCE.

## Attempt rules

- Development attempts are `A01`, `A02`, and `A03` by default.
- Delivery and review artifacts are immutable per attempt.
- CHANGES_REQUIRED increments the attempt; process retries that produced no source mutation may reuse the same attempt with a distinct run ID.
- A fourth correction need becomes BLOCKED and requires human direction.
- An APPROVED attempt cannot be replaced without a new task revision authorized by Codex/human.

## Idempotency and duplicate prevention

- Every transition uses expected-current-state compare-and-swap semantics.
- Event keys include project, task, attempt, artifact type, and digest.
- Duplicate events with identical digests are acknowledged without reprocessing.
- Same identity with a different digest is a conflict and stops in HUMAN_REVIEW.
- Checkpoints include task/attempt metadata and the approved review digest.

## Monitoring and timeouts

- Filesystem events wake the runner; a 30-second poll performs full reconciliation.
- Agent timeout is configured per task class, with a global upper bound approved before activation.
- Heartbeat absence does not kill an unknown process blindly; ownership is verified from the recorded process handle/run identity.
- Stalled tasks appear in `PROJECT_STATUS.md` and require retry policy or human review.

## Recovery scenarios

| Scenario | Required response |
|---|---|
| Runner restarts during development | Reconcile lease/process identity; resume observation or mark EXECUTION_FAILED without redispatching blindly. |
| Delivery exists but state is IN_DEVELOPMENT | Validate identity/digest and advance exactly once. |
| Reviewer crashes | Preserve delivery; retry review with a new run ID. Never approve. |
| Git diff differs from delivery baseline | Stop as conflicting source changes. |
| Corrupt/missing state database | Stop; reconstruct only through documented audit replay and human approval. Never overwrite silently. |
| JSON status projection is missing | Regenerate from authoritative store. |
| Atomic rename fails | Leave temporary artifact quarantined and retry; do not process it. |
| DeepSeek/Codex unavailable | Preserve current state and report dependency. |
| Test command times out | Record unverified criterion; review cannot claim it passed. |
| Maximum corrections reached | BLOCKED -> HUMAN_REVIEW. |

## Final verification

Codex checks every mandatory roadmap task, Git checkpoint, current requirements mapping, test/build evidence, open security issues, documentation, and deployment/restore drill evidence. It then writes READY_FOR_ACCEPTANCE or BLOCKED. Only the human owner can declare COMPLETED.
