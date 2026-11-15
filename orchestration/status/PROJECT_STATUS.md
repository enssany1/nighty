# Nighty Project Status

**Updated:** 15 November 2026, 11:36 +04

**Phase:** Production application and orchestration acceptance delivered locally

**State:** PROJECT_DELIVERED_LOCALLY

**Progress:** TASK-901 A03 and TASK-001 through TASK-015 are checkpointed. ORCH-001 through ORCH-010 are accepted. Real synthetic Codex and DeepSeek proofs are recorded in `orchestration/acceptance/LIVE_PROVIDER_EVIDENCE.md`; the human owner approved that evidence on 15 November 2026. The unsafe standalone DeepSeek desktop GUI is excluded from activation. The optional foreground runner remains inactive by operational decision, and no push, merge, deployment, service, or scheduled task was created.

## Application implementation authorization and status

The owner explicitly authorized Codex to continue independently and unattended until the project is delivered. The exact direct-implementation decision is recorded in `orchestration/status/ACTIVATION_DECISION.md`. The application checkpoints remain direct Codex work and are not relabeled as DeepSeek deliveries or independent runner reviews. Orchestration acceptance is supported separately by deterministic runner evidence and `orchestration/acceptance/LIVE_PROVIDER_EVIDENCE.md`.

Production deployment ruling (15 November 2026): the owner explicitly authorized an external deployment at `https://www.envi.one/nighty/`, with a clean production database, one `admin` user, and a temporary bootstrap password supplied out of source control. The implementation keeps root deployments compatible while making the frontend base path configurable. This record does not claim the external deployment completed; server access and public verification remain mandatory evidence before that state can change.

TASK-001 established and verified:

- Node 24/npm 11 workspaces for the NestJS API, React web app, API client, and test fixtures.
- Stable API and browser health boundaries.
- Strict TypeScript, Helmet, bounded request parsing, request IDs, and sans-serif-only design tokens.
- Valid Docker Compose topology with persistent PostgreSQL and attachment volumes.
- Locally built Nighty API and web images.
- Initial TASK-001 gate: 116 orchestration tests plus API/web smoke tests passed; all workspaces built; the production dependency audit reported zero vulnerabilities.

Checkpoint evidence: docs/implementation/TASK-001-CHECKPOINT.md.

TASK-002 added:

- Prisma 7.10 PostgreSQL schema and generated client boundary for all approved V1 owners.
- Initial migration with database-owned uniqueness, lifecycle, range, digest, exclusive-parent, and one-active-shift constraints.
- Idempotent non-destructive development seed with four users, three shifts, assignments, one operational day, representative Update/To-do/Follow records, tags, and settings.
- Nest Prisma service using the official pg adapter.
- Four passing real PostgreSQL integration tests.

Checkpoint evidence: docs/implementation/TASK-002-CHECKPOINT.md.

TASK-003 added:

- Validated Nest request/response DTOs for every approved V1 API area.
- Global transformed whitelist validation with unknown-field rejection.
- Stable OpenAPI component schemas, paths, and operation identifiers.
- Deterministic checked-in browser contract generation consumed through `@nighty/api-client`.
- Passing contract, generation-cleanliness, typecheck, build, and production dependency gates.

Checkpoint evidence: docs/implementation/TASK-003-CHECKPOINT.md.

TASK-004 added:

- Argon2id password verification with generic invalid-credential behavior.
- Digest-only 256-bit opaque session and CSRF values.
- Thirty-minute sliding inactivity expiry that never extends expired sessions.
- Production-secure HttpOnly session cookies, CSRF rotation/enforcement, and logout invalidation.
- Global fail-closed session, CSRF, and ADMIN/OPERATOR role guards.

Checkpoint evidence: docs/implementation/TASK-004-CHECKPOINT.md.

TASK-005 added normalized immutable users, multi-shift assignment, transactional administrator invariants, temporary-password resets, profile updates, session revocation, and password-safe audit evidence.

Checkpoint evidence: docs/implementation/TASK-005-CHECKPOINT.md.

TASK-006 added overlap-tolerant 24-hour coverage validation, safe shift reordering, immutable operational-day definition snapshots, and historical user-assignment snapshots.

Checkpoint evidence: docs/implementation/TASK-006-CHECKPOINT.md.

TASK-007 added state-owned daily canvases, Update/To-do/Follow entries, bounded editor documents, immutable assignment-based write permissions, independent To-do toggles, and revision history.

Checkpoint evidence: docs/implementation/TASK-007-CHECKPOINT.md.

TASK-008 added clock-independent serializable Handover, concurrent idempotency, exactly-once Follow transfer, next-day rollover, incoming Follow projection, and accountable Follow completion.

Checkpoint evidence: docs/implementation/TASK-008-CHECKPOINT.md.

TASK-009 added newest-first Tag whiteboards, safe rename/reorder/archive/delete invariants, random-key local storage, server-owned MIME detection, inline image disposition, authenticated digest-checked downloads, and adversarial upload coverage.

Checkpoint evidence: docs/implementation/TASK-009-CHECKPOINT.md.

TASK-010 added typed General/Security/Retention settings, approved defaults, administrator-only mutation, centralized before/after audit writing with request/session metadata, and immutable filtered Audit reads.

Checkpoint evidence: docs/implementation/TASK-010-CHECKPOINT.md.

TASK-011 added indexed multi-filter search, bounded deterministic cursor paging, dry-run retention preview, marked ownership, inherited attachment deletion, partial-failure retention, idempotent retry, and audit summaries.

Checkpoint evidence: docs/implementation/TASK-011-CHECKPOINT.md.

TASK-012 added API-backed login and session restoration, explicit 30-minute expiry recovery, role-aware navigation, sign out, and responsive Profile/password UI with in-memory CSRF handling.

Checkpoint evidence: docs/implementation/TASK-012-CHECKPOINT.md.

TASK-013 added the compact calendar/Tags sidebar, adjacent scrollable daily canvas, Tiptap Update/To-do/Follow composer, manual Handover, inline images/attachments, combined Search, draft recovery, and separate newest-first Tag whiteboards.

Checkpoint evidence: docs/implementation/TASK-013-CHECKPOINT.md.

TASK-014 added the selected administration sidebar, Back to operations, Users/Shifts/Tags inspectors, General/Security/Retention forms and confirmations, and immutable Audit filtering/evidence inspection.

Checkpoint evidence: docs/implementation/TASK-014-CHECKPOINT.md.

TASK-015 added real-browser accessibility/responsive/persistence coverage, hardened non-root images and reverse proxy, clean-volume bootstrap, live/readiness checks, CI, operations guidance, and digest-manifested backup/restore with isolated recovery drills.

Checkpoint evidence: docs/implementation/TASK-015-CHECKPOINT.md.

## Status lineage

An earlier revision overclaimed ORCH acceptance before the integrated foreground runner and recovery evidence existed. That correction was valid at the time. Subsequent commits now provide deterministic acceptance evidence for ORCH-001 through ORCH-004 and ORCH-007 through ORCH-009, as recorded below and in `TASK_STATUS.json`.

Two operational limitations remain:

1. The foreground runner is tested but remains deliberately inactive; a future start is a separate explicit operation.
2. The standalone DeepSeek desktop GUI is not an authorized substitute for the isolated production profile.

## TASK-901 status

- A01 was independently reviewed as `CHANGES_REQUIRED` in `orchestration/reviews/TASK-901-A01-REVIEW.md`.
- A02 was independently reviewed as `CHANGES_REQUIRED` in `orchestration/reviews/TASK-901-A02-REVIEW.md`: the reconciler supplied ownership per run, but `CodexAdapter` ignored that invocation callback.
- A03 confirms Codex's local adapter forwarding correction, strengthens the real-adapter/reconciler regression to prove the run and lease PID (and the actual spawned provider PID) before provider completion, and is independently `APPROVED` in `orchestration/reviews/TASK-901-A03-REVIEW.md`.
- The exact reviewed TASK-901 inventory is checkpointed on `codex/orchestration-foundation`. No merge, push, deployment, service, or scheduled task was created.
- Live synthetic Codex and DeepSeek invocations were run only in disposable repositories outside Nighty; see `orchestration/acceptance/LIVE_PROVIDER_EVIDENCE.md`.
- A01/A02 deliveries and reviews are preserved.

## Implemented and unit-tested under TASK-901

- A03 adapter integration: a real `CodexAdapter` used directly as the reconciler's `ArtifactProducer` persists the actual spawned provider PID on both the RUNNING run and live lease before provider completion. Codex's per-run forwarding correction is reproduced RED then GREEN.
- A02 provider ownership: the root PID is recorded transactionally on the RUNNING run and live lease through a synchronous process-start callback; ownership failure terminates the family.
- A02 descendant containment: owned descendants are tracked while the root is alive and bounded, evidenced cleanup also runs after a normal exit; the grandchild must be dead before the result returns.
- A02 adapter path containment: output and schema paths are proved inside `projectRoot` with reparse-ancestor rejection before any read, delete, spawn, or write.
- A02 task authority: exact task SHA-256 is required in reviews and approval bindings, verified during review ingestion and again at checkpoint.
- Bounded, strict-UTF-8 control-artifact reads with reparse-point rejection and pre-allocation size checks.
- Markdown front-matter/section parsing that ignores fenced headings and rejects malformed input.
- Local JSON-Schema-subset validation with fail-closed unsupported keywords; tightened task, delivery, and review schemas.
- Windows process-family cleanup with owned root/descendant PID evidence, bounded cleanup, structured cleanup evidence, and real grandchild regression tests.
- Approval binding across task/revision/attempt, delivery digest, review digest, branch, baseline/head/tree, reviewed source and inventory digests, and exact inventory comparison immediately before checkpoint.
- State ownership retained through APPROVED, CHECKPOINTED, and HUMAN_REVIEW; explicit audited ownership release; attempts, runs, leases, revision changes, and expired-lease supersession.
- Foreground reconciler covering rename-before-database-record, delivery-record-before-state-advance, live-producer safety, duplicate suppression, conflict quarantine, review ingestion, checkpoint gating, and injected development/review producers.
- Bounded task-prompt reads, invalid-UTF-8 rejection, and control-artifact reparse-point rejection.
- Credential redaction in captured process output, adapter errors, persisted state reasons, and rejected structured output.
- Verification-registry sealing and fail-closed finalization.
- Dedicated runner-owned DeepSeek `CODEX_HOME` preparation that requires no credential, rejects shared/ambient user configuration, and disables the autonomous shell tool.

## ORCH plan acceptance status

| Task | Current state | Evidence / remaining acceptance |
|---|---|---|
| ORCH-001 | Accepted | Deterministic fixture matrix, idempotency, never-overwrite, and no-provider proof. |
| ORCH-002 | Accepted | Reopened SQLite preservation, regenerated projections, and owner/lease concurrency. |
| ORCH-003 | Accepted | Exclusive foreground lock, watcher wakeups, 30-second polling default, atomic rename, and conflict quarantine. |
| ORCH-004 | Accepted | Heartbeats, exact owned-process restart recovery, cleanup retry, and late-output quarantine. |
| ORCH-005 | Accepted | Authenticated real `CodexAdapter` delivery/review outputs passed local schemas; isolated unauthenticated execution failed closed. |
| ORCH-006 | Accepted | Real DeepSeek synthetic TDD delivery, model identity, out-of-root denial, diff verification, sentinel preservation, secret scan, and runner-owned `shell_tool = false` boundary are recorded. The desktop GUI is excluded from activation. |
| ORCH-007 | Accepted | Clean-baseline gate, exact approved inventory, Conventional Commit, branch/source drift, commit failure, and duplicate prevention. |
| ORCH-008 | Accepted | Sealed command registry and exact PASSED/FAILED/UNVERIFIED claim-versus-reality validation, including injection tests. |
| ORCH-009 | Accepted | Complete documented recovery matrix in `orchestration/acceptance/RECOVERY_MATRIX.md`. |
| ORCH-010 | Accepted | A01 changes required, A02 approved, one checkpoint, SQLite reopen, foreground restart, no duplicate commit, real provider proofs, and human evidence sign-off pass. The optional runner remains inactive. |

## Verification evidence

- `npm run typecheck`: exit 0 across the runner and all production workspaces.
- `npm run check`: exit 0 (142 orchestration, 5 bootstrap-policy, 26 API unit, 10 web, and generated-client tests).
- `npm run build --workspaces --if-present`: exit 0.
- `docker compose config`: exit 0.
- `docker build -f docker/api.Dockerfile` and `docker build -f docker/web.Dockerfile`: exit 0.
- `npm audit --omit=dev --audit-level=high`: exit 0, zero vulnerabilities.
- `git diff --check`: exit 0.
- `npm run test:integration -w @nighty/api`: exit 0, 27 tests.
- `npm run test:e2e`: exit 0, 10 real-browser tests; post-image-recreate login handoff also passes.
- Production API/web image rebuilds: exit 0; recreated containers use the exact new image IDs and are healthy.
- Established-database restart with cleared bootstrap credentials and an API-container recreation: passes; API runs as UID 1000 and web as UID 101.
- Disposable empty-database bootstrap drill: missing credentials fail with zero users; valid values create `1|3|1|1` user/shift/day/audit counts; drill database removed.
- Empty-volume bootstrap, restart persistence, attachment-inclusive backup, and isolated restore drills: exit 0.
- Git was supplied through the exact provided executable directory, not installed.

## Known limitations

- Live provider proofs used disposable repositories outside Nighty. No live DeepSeek API-key invocation occurred through Nighty's production adapter.
- The DeepSeek desktop Harness ignored a project-local shell override and launched a fresh full-access session; it is explicitly excluded from activation.
- The foreground runner is acceptance-tested but remains deliberately inactive outside disposable tests.
- Localized Windows `taskkill` output and a forced cleanup-failure retry remain unexercised; cleanup evidence records `remainingPids`, `deadlineExceeded`, and `failures`.
- Windows descendant liveness is tracked by a bounded polling window while the root is alive; a descendant that both survives and starts after the final poll could escape discovery. The recorded run/lease PID and cleanup evidence remain explicit.
- Task-content authority is a SHA-256 of the exact task file; changing task contents without a revision bump is rejected at review ingestion and checkpoint.
- No credential was read, displayed, persisted, or sent by the acceptance workflow; redaction remains proven with synthetic values only.

## Current operating decision

No project-delivery action remains. Nighty is available locally at `http://localhost:8088`. Starting the optional foreground runner, pushing, merging, or deploying remain separate future operations and are not required for local use.
