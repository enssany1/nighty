# Nighty – Shift Operations Handover

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Nighty is an open-source, self-hosted shift handover workspace for a 24/7 operations team (NOC, SOC, IT service desk, control room). Each operational day is one scrollable canvas where every shift logs updates, to-do lists and follow-ups. Handover is a deliberate, manual action, and open Follow items carry over to the next shift exactly once, so nothing is lost between teams.

![Daily canvas with Morning, Evening and Night shifts](docs/screenshots/02-daily-canvas.png)

## Live demo

**<https://www.envi.one/nighty/>**

| Username | Password |
| --- | --- |
| `admin` | `password1234` |

This is a shared public test instance. Anything you enter is visible to other testers and may be reset at any time, so do not store real or sensitive information in it.

## Screenshots

| Sign in | Tag whiteboard |
| --- | --- |
| ![Sign-in page](docs/screenshots/01-login.png) | ![Tag whiteboard](docs/screenshots/03-tag-whiteboard.png) |

| Shift settings | Mobile |
| --- | --- |
| ![Shift schedule settings](docs/screenshots/04-settings-shifts.png) | <img src="docs/screenshots/05-mobile.png" alt="Daily canvas on a phone" width="280"> |

## Features

- **Daily handover canvas** – one page per operational day, grouped by shift, with rich-text entries and full revision history.
- **Three entry types** – Update, To-do list and Follow. Follow items transfer to the next shift exactly once at handover.
- **Manual handover** – the outgoing shift decides when to hand over to the next shift; it is never forced by the clock.
- **Automatic new day** – when the date changes, today's operational day opens on the shift scheduled for the current time and open Follow items carry over.
- **Autosave** – entries are saved and shown on the board as you type; there is no Submit button.
- **Flexible schedules** – shifts may overlap, but the active schedule must cover all 24 hours with no gap.
- **Tag whiteboards** – shared reference boards (for example `#issues`, `#maintenance`) with pasted images and file attachments.
- **Search** across entries and whiteboards (`Ctrl K`).
- **Administration** – users and roles, shift definitions, tags, security settings, retention and an immutable audit log.
- **Security** – server-side sessions in HTTP-only cookies, CSRF protection, Argon2id password hashing and 30-minute idle expiry.
- **Retention** – 365 days by default; cleanup runs only after an administrator previews and confirms it.
- **Responsive** – works on desktop, tablet and phone.

## Tech stack

- **Web:** React 19, TypeScript, Vite, Tiptap
- **API:** NestJS 11, TypeScript, Prisma 7, OpenAPI-generated client
- **Database:** PostgreSQL 17
- **Packaging:** Docker Compose (Nginx web proxy, API, PostgreSQL), with backup and restore scripts
- **Tests:** Jest, Vitest and Playwright

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

- Update, To-do list, and Follow are the only canvas actions. They save automatically while you type; press Enter twice to start the next entry.
- Handover between shifts is manual and is never locked to the scheduled clock time. A new operational day opens automatically when the date changes in the configured time zone (set `DAY_ROLLOVER=manual` to turn this off).
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

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/api` | NestJS API, Prisma schema and migrations |
| `apps/web` | React single-page application |
| `packages/api-client` | TypeScript client generated from the OpenAPI contract |
| `docker`, `compose*.yaml` | Container images and Compose overlays |
| `scripts` | Bootstrap, backup and restore scripts |
| `docs` | Operations guide, approved product design and implementation records |
| `orchestration` | Records and tooling from the AI-assisted build workflow used to develop Nighty |

## License

Released under the [MIT License](LICENSE).
