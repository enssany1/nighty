# TASK-001 production workspace checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** e141ac6c6c0cf31a546424edafd1004195c85c27

## Outcome

The Nighty production npm workspace is established without modifying the approved prototype. The API exposes the stable health boundary through NestJS and applies Helmet, bounded body parsers, request IDs, shutdown hooks, and validated port configuration. The React/Vite application establishes the approved product identity and a sans-serif-only visual baseline. Compose defines healthy PostgreSQL, API, and nginx web services with separate persistent database and attachment volumes.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- API RED: npm test -w @nighty/api exited 1 because ../app.module did not exist.
- Web RED: npm test -w @nighty/web exited 1 because ./App did not exist.
- API GREEN: one smoke test passed.
- Web GREEN: one smoke test passed.

## Verification

- npm run check -> exit 0; 116 orchestration tests, one API smoke test, and one web smoke test passed.
- npm run build --workspaces --if-present -> exit 0.
- docker compose config -> exit 0.
- docker compose build api web -> exit 0; both local images built.
- npm audit --omit=dev --audit-level=high -> exit 0, zero vulnerabilities.
- git diff --check -> exit 0; line-ending warnings only.

## Review findings

1. All four required npm workspaces compile under Node 24 and strict TypeScript.
2. GET /api/health is tested through a real Nest application and returns the exact stable payload.
3. The browser shell exposes Nighty and Shift Operations Handover and contains no serif font.
4. The runtime boundary includes Helmet, bounded request parsing, request IDs, validated port selection, and shutdown hooks.
5. Compose validates, persists PostgreSQL and attachments separately, and gates service ordering on health.
6. Both production images build; the API runtime uses the unprivileged node account.
7. The Docker context excludes Git data, local dependencies, builds, environment files, databases, and logs.

## Limitations

Database migration, secure sessions, CSRF, business authorization, full approved UI, backup/restore, and end-to-end accessibility remain owned by later tasks. Container startup against a migrated database begins with TASK-002.

## Security notes

No production credential, deployment, push, merge, service, scheduler, or background agent was created. The environment example contains development-only values.
