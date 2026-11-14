# TASK-003 typed API contract checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** c0c4ba0

## Outcome

Nighty now has validated request and response DTOs, strict global request validation, a reproducible OpenAPI document, and deterministic generated TypeScript contract types for the browser workspace.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: the contract suite failed because the DTO contract module did not exist.
- GREEN: contract tests cover unknown-field rejection, all approved V1 component schemas and endpoint areas, and the exact Update/To-do/Follow action enum. Generated-client tests prove checked-in output is current and includes representative schemas and paths.

## Contract ownership

- Nest DTOs own request validation and documented response shapes.
- `createOpenApiDocument` owns the stable OpenAPI document and operation identifiers.
- `packages/api-client/scripts/generate.mjs` owns browser contract generation from checked-in OpenAPI JSON.
- The web workspace consumes generated payload types through `@nighty/api-client`; no separate handwritten payload model was introduced.

## Verification

- `npm run api:generate` -> exit 0.
- `npm run test:contract -w @nighty/api` -> exit 0, 3 passed.
- `npm test -w @nighty/api-client` -> exit 0, 1 passed.
- `npm run typecheck -w @nighty/api-client` -> exit 0.
- `npm run typecheck -w @nighty/api` -> exit 0.
- Full repository verification, build, generation-cleanliness, and production audit are recorded immediately before the checkpoint commit.

## Review findings

1. Global validation transforms payloads, strips no unknown fields silently, and rejects non-whitelisted input.
2. Stable component schemas exist for authentication, users, shifts, canvas, entries, handover, tags, attachments, search, settings, and audit.
3. Entry actions expose only UPDATE, TODO, and FOLLOW; removed Decision, Issue, and Checklist actions cannot enter through this contract.
4. The generator is local, deterministic, and compatible with the pinned TypeScript toolchain without adding an unsupported generator dependency.
5. OpenAPI JSON and generated TypeScript are checked in so contract drift is reviewable.

## Limitations

The paths are the approved contract surface; endpoint controllers and business behavior begin in TASK-004. Collection pagination and richer error schemas will be completed with the owning endpoints without broadening accepted request fields.
