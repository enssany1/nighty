# Nighty – Shift Operations Handover

Nighty is a responsive browser application for one 24/7 operations team. It gives each operational day a scrollable handover canvas, allows shifts to overlap, carries explicit Follow actions into the next manually opened shift, and keeps separate Tag whiteboards for shared reference material.

## Local access

Prerequisites: Docker Desktop and Docker Compose.

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "choose-a-unique-12-character-password"
docker compose up -d --build
```

Open [http://localhost:8088](http://localhost:8088). Database migrations run automatically. On an empty database only, the bootstrap variables create the first administrator, the approved Morning/Evening/Night 24-hour schedule, and today's operational day. Remove the bootstrap password from the shell after the first successful login.

The checked-in development database seed is optional and never runs in production:

```powershell
$env:DATABASE_URL = "postgresql://nighty:nighty_dev@127.0.0.1:5432/nighty?schema=public"
npm ci
npm run prisma:setup:test -w @nighty/api
```

Development seed users are `aisha`, `marcus`, `daniel`, and `ethan`; their local-only password is `NightyDemo!2026`.

## Product behavior

- Update, To-do list, and Follow are the only canvas actions.
- Handover is manual and is never locked to the scheduled clock time.
- Follow actions transfer exactly once to the next shift.
- Shifts may overlap, but the active schedule must cover all 24 hours without an uncovered gap.
- Secure server-side sessions use HTTP-only cookies and expire after 30 inactive minutes.
- Images pasted into a canvas or Tag whiteboard render inline; ordinary files remain attachments.
- Retention defaults to 365 days and permanently deletes eligible operational days only after an administrator previews and confirms cleanup.

## Verification

```powershell
npm ci
npm run api:generate
npm run check
npm run test:integration -w @nighty/api
npm run build --workspaces --if-present
npm audit --omit=dev --audit-level=high
docker compose config
docker compose build api web
```

Production deployment, health checks, backup, restore, security, and troubleshooting are documented in [docs/operations.md](docs/operations.md). Product and architecture decisions remain under [docs/approved](docs/approved).

## Contribution state

This branch is a complete local delivery checkpoint. It is not pushed, merged, or deployed to an external environment. A human owner must review the final diff and validation evidence before declaring a pull request ready, as required by the repository contribution policy.
