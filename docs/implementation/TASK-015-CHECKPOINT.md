# TASK-015 release-hardening checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization  
**Status:** Ready for human acceptance  
**Baseline:** f16a269

## Outcome

Nighty is locally delivered as a responsive browser application with hardened Docker images, persistent PostgreSQL and attachment volumes, first-start administration, operations guidance, digest-manifested backup/restore, CI, and real-browser acceptance coverage. The live deployment is available at `http://localhost:8088`.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery. The orchestration runner remains inactive. Repository policy reserves the final `COMPLETED` declaration for the human owner after reviewing the diff and evidence.

## Verification

- `npm ci` and deterministic API/OpenAPI client regeneration completed; generated output was included and rechecked.
- `npm run check` -> exit 0: 116 orchestration regressions, 26 API unit tests, 10 web tests, generated-client test, and all typechecks passed.
- `npm test --workspaces --if-present` -> exit 0.
- `npm run test:integration -w @nighty/api` -> exit 0: 27 PostgreSQL integration tests passed.
- `npm run test:e2e` -> exit 0: 10 Playwright tests passed across access, operations, draft recovery, persistence, Settings, accessibility, and 390/768/1280 responsive layouts.
- `npm run build --workspaces --if-present` -> exit 0.
- `npm audit --omit=dev --audit-level=high` -> exit 0, zero production vulnerabilities.
- Local and production Compose validation and API/web image builds -> exit 0.
- API PID 1 runs as `node`; web runtime runs as unprivileged nginx UID 101.
- Liveness, database-backed readiness, proxy health, CSP, frame denial, nosniff, and no-referrer headers were observed on the live deployment.
- Empty-volume bootstrap drill -> one ADMIN, three shifts, one operational day, one ACTIVE shift, one bootstrap audit event, ready API.
- Restart persistence -> submitted entry, inline image, attachment, and manual Handover remained available.
- Final backup/isolated restore drill -> live and restored counts matched at 4 users, 4 entries, and 2 attachment records; 2 attachment files were restored after manifest digest verification.
- PowerShell backup/restore syntax, explicit restore confirmation, and isolated-project cleanup were exercised.

## Release review

1. The bootstrap audit insert initially exposed a UUID/text parameter reuse defect during a genuinely empty-volume drill. The SQL boundary now uses distinct typed parameters, and the same clean drill passes.
2. Adding Playwright specifications initially exposed Vitest's broad default discovery. Vitest is now explicitly scoped to `src/**/*.spec.{ts,tsx}`, keeping browser tests under Playwright ownership.
3. The live stack was recreated from the final images without replacing the database or attachment volumes and is healthy on port 8088.
4. No push, merge, external deployment, scheduled runner, or production credential was created.

## Human acceptance boundary

The implementation is ready for the owner to review. The author-readiness declaration remains human-owned and is not attested by Codex.
