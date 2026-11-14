# Nighty Project Status

**Updated:** 14 November 2026  
**Phase:** Orchestration foundation implementation  
**State:** BLOCKED_EXTERNAL_DEPENDENCY  
**Progress:** 8 of 10 orchestration tasks verified; live provider pilot pending

## Completed and checkpointed

- ORCH-001 — repository protocol, schemas, and configuration.
- ORCH-002 — transactional SQLite task state.
- ORCH-003 — atomic artifact inbox.
- ORCH-004 — bounded process supervision.
- ORCH-005 — Codex controller adapter; real read-only structured probe passed on Codex CLI 0.169.0.
- ORCH-007 — Git baseline and approval digest gate.
- ORCH-008 — immutable verification command allowlist.
- ORCH-009 — restart/recovery decision matrix.

## Partially prepared

- ORCH-006 — isolated DeepSeek configuration and environment boundary are implemented and tested. A live DeepSeek invocation has not run.

## Blocked

- No DEEPSEEK_API_KEY was present at process, user, or machine scope during inspection.
- ORCH-006 live disposable pilot therefore cannot pass.
- ORCH-010 end-to-end pilot and Nighty application tasks cannot start without silently substituting the named developer provider, which is prohibited.

## Verification evidence

- npm run typecheck: passed.
- npm test: 33 tests passed, 0 failed.
- Real Codex controller probe: read-only, ephemeral, schema-constrained result returned status ok.
- DeepSeek live provider behavior: **not verified**.

## Next required action

The human owner must provide a valid DeepSeek API credential through the approved transient environment mechanism. Do not paste the credential into Markdown, chat reports, Git, application .env files, or shared Codex configuration.
