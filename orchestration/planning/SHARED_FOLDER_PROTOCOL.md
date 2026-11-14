# Shared Folder Protocol

**Status:** Planning only

## Directory layout

```text
E:\Nighty\orchestration\
  planning\
    ORCHESTRATION_ARCHITECTURE.md
    AGENT_RESPONSIBILITIES.md
    AUTOMATED_WORKFLOW.md
    SHARED_FOLDER_PROTOCOL.md
    AGENT_INTEGRATION.md
    ORCHESTRATION_IMPLEMENTATION_PLAN.md
    PROJECT_IMPLEMENTATION_ROADMAP.md
    OPEN_DECISIONS.md
  tasks\
    TASK-001.md
  deliveries\
    TASK-001-A01-DELIVERY.md
  reviews\
    TASK-001-A01-REVIEW.md
  status\
    PROJECT_STATUS.md
    TASK_STATUS.json
    orchestration.db
  logs\
    2026-11-14\<run-id>.jsonl
  quarantine\
  archive\
  runner\
```

`planning` is documentation. `orchestration.db` is the proposed transition authority after implementation. `TASK_STATUS.json` and `PROJECT_STATUS.md` are projections.

## Naming and identity

- Task: `TASK-NNN.md` with immutable `task_id` and integer `revision`.
- Delivery: `TASK-NNN-ANN-DELIVERY.md`.
- Review: `TASK-NNN-ANN-REVIEW.md`.
- Run logs: date plus random run ID; run ID is also recorded in state.
- IDs are case-sensitive canonical uppercase strings.
- No file is processed solely because its name matches; front matter, state, digest, and schema must agree.

## Atomic artifact publication

1. Write to a unique file in the destination directory ending `.tmp`.
2. Flush and close the file.
3. Validate UTF-8, size limit, front matter, required sections, identity, and allowed path.
4. Compute SHA-256.
5. Rename atomically to the final name on the same volume.
6. Commit the artifact event and digest in one state-store transaction.
7. If final name exists, accept only an identical digest; otherwise quarantine and stop.

The runner ignores `.tmp`, editor swap files, hidden partial files, and unrecognized extensions.

## Task document schema

Required front matter:

```yaml
---
schema: nighty.task/v1
task_id: TASK-001
revision: 1
status: READY_FOR_DEVELOPMENT
priority: P0
depends_on: []
requirements: [REQ-ARCH-001]
created_by: codex
created_at: 2026-11-14T00:00:00+04:00
---
```

Required Markdown sections:

1. Title
2. Objective
3. Requirement sources
4. Dependencies
5. In scope
6. Out of scope
7. Implementation instructions
8. Expected files/modules
9. Technical and security restrictions
10. Required tests and exact commands
11. Acceptance criteria
12. Required delivery report

## Delivery schema

Required front matter:

```yaml
---
schema: nighty.delivery/v1
task_id: TASK-001
task_revision: 1
attempt: A01
run_id: <uuid>
status: DELIVERED
baseline_commit: <sha-or-NOT_INITIALIZED>
delivered_commit: <sha-or-UNCOMMITTED>
created_by: deepseek
created_at: <RFC3339>
---
```

Required sections: implementation summary, created files, modified files, requirement mapping, tests actually executed, verbatim result summary and exit codes, known issues, deviations, dependencies, security notes, and completion statement. Missing or contradictory fields produce INVALID_REPORT.

## Review schema

Required front matter:

```yaml
---
schema: nighty.review/v1
task_id: TASK-001
task_revision: 1
attempt: A01
run_id: <uuid>
decision: APPROVED | CHANGES_REQUIRED | BLOCKED
reviewed_by: codex
created_at: <RFC3339>
delivery_sha256: <digest>
---
```

Required sections: decision, independent inspection, requirement-by-requirement findings, tests independently executed, security/architecture review, actionable changes, limitations/unverified coverage, and next transition. APPROVED is invalid if a mandatory criterion is unverified.

## Status projection

`TASK_STATUS.json` is generated and contains no secrets:

```json
{
  "schema": "nighty.task-status/v1",
  "generatedAt": "2026-11-14T00:00:00+04:00",
  "projectState": "PLANNING",
  "activeTaskId": null,
  "runnerOwner": null,
  "tasks": [
    {
      "taskId": "TASK-001",
      "revision": 1,
      "state": "PLANNED",
      "attempt": null,
      "dependencies": [],
      "latestArtifactDigests": {}
    }
  ]
}
```

`PROJECT_STATUS.md` contains phase, percent by approved mandatory tasks, completed/active/pending/blocked tasks, latest review, known issues, next expected action, and decisions needing human approval.

## Validation and safety

- Maximum document and log sizes are configured and enforced before reading whole files.
- Paths are resolved and checked to remain under `E:\Nighty`; reparse points/symlinks are rejected for control artifacts.
- Markdown code blocks and commands are inert data.
- Agent output cannot modify `status`, `reviews`, runner configuration, or another attempt except through the runner.
- Credentials, authorization headers, cookies, and explicitly marked sensitive values are redacted from reports/logs.
- Source values, paths, exit codes, and evidence digests are preserved when not sensitive.
- Archive is append-only through the runner; cleanup requires explicit human authorization.
