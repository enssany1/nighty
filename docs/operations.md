# Nighty operations guide

## Deployment topology

Nighty runs as three containers: an unprivileged Nginx web/reverse-proxy container, a Node/NestJS API container whose application process runs as the unprivileged `node` user, and PostgreSQL 17. Only the web proxy is published by the production Compose overlay. PostgreSQL data and attachment bytes use independent named volumes.

## First production start

Store secrets outside the repository. The first start requires a database password and one-time bootstrap administrator values:

```powershell
$env:POSTGRES_PASSWORD = "a-long-random-database-password"
$env:BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "a-different-long-random-password"
$env:BOOTSTRAP_ADMIN_DISPLAY_NAME = "Operations Administrator"
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

Migrations run before the API starts. If the `User` table is empty, the bootstrap requires valid one-time administrator values and creates exactly one administrator, a Morning/Evening/Night schedule covering all 24 hours, assigns the administrator to those shifts, and starts today's first shift. It refuses missing or invalid credentials for an empty database and does nothing once any user exists.

After the first successful login, remove the one-time values and recreate the API container so Docker no longer retains them in the container configuration:

```powershell
Remove-Item Env:BOOTSTRAP_ADMIN_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps --force-recreate api
docker compose -f compose.yaml -f compose.production.yaml exec api node -e 'if (process.env.BOOTSTRAP_ADMIN_USERNAME || process.env.BOOTSTRAP_ADMIN_PASSWORD) process.exit(1)'
```

The final command exits successfully only when both values are empty in the recreated container. Established installations restart without either one-time value; an empty database still fails closed.

Terminate TLS at a trusted reverse proxy in front of port 8088. The bundled Nginx proxy sets CSP, frame, content-type, referrer, and permissions headers and limits uploads to 11 MiB. Keep the API and database unpublished as defined by `compose.production.yaml`.

### Deploying below a URL path

Set `VITE_BASE_PATH` before building when Nighty is served below a path such as `/nighty/`. The value must begin and end with `/`:

```powershell
$env:VITE_BASE_PATH = "/nighty/"
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

The public reverse proxy must strip that prefix before forwarding to Nighty's web port. For Nginx, keep the trailing slash on both the location and `proxy_pass` target so `/nighty/api/...`, `/nighty/assets/...`, and SPA navigation all reach the bundled proxy correctly:

```nginx
location = /nighty { return 308 https://$host/nighty/; }
location /nighty/ {
  proxy_pass http://127.0.0.1:8088/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Do not map Nighty to the site's root `/api` path; its API remains namespaced below the configured base path.

## Health and readiness

- Web liveness: `GET /healthz`
- API liveness: `GET /api/health/live`
- API readiness, including a PostgreSQL query: `GET /api/health/ready`

Compose waits for PostgreSQL and API health before starting the web proxy. All services use graceful process signals; NestJS shutdown hooks are enabled.

## Backup

The backup script takes a PostgreSQL custom-format dump and an attachment-volume archive under one timestamped directory, then writes SHA-256 digests to `manifest.json`.

```powershell
./scripts/backup.ps1 -DeploymentDirectory . -OutputDirectory D:\NightyBackups
```

Keep the resulting directory together and copy it to storage with access controls appropriate for operations records.

## Restore

Restore is destructive and requires the explicit `-ConfirmRestore` switch. The script validates the manifest and both digests, stops the API and web services, restores PostgreSQL, replaces only the named Nighty attachment volume contents, and restarts the application.

```powershell
./scripts/restore.ps1 -BackupDirectory D:\NightyBackups\nighty-YYYYMMDDTHHMMSSZ -DeploymentDirectory . -ConfirmRestore
```

For a disposable drill, pass `-ProjectName` and the relevant `-ComposeFiles` so the restore targets only that named Compose project.

After restoration, verify `/api/health/ready`, sign in, open a known operational day, and download one known attachment.

## Updates

1. Take and verify a backup.
2. Review release notes and environment changes.
3. Run `docker compose -f compose.yaml -f compose.production.yaml build`.
4. Run `docker compose -f compose.yaml -f compose.production.yaml up -d`.
5. Confirm web/API health and inspect container logs.

Migrations are additive and run automatically. Never edit or delete a named volume manually.

## Incident checks

- Login loops: verify the browser reaches Nighty through one stable origin and inspect cookie/TLS policy.
- API not ready: inspect `docker compose logs api postgres`; readiness fails closed when PostgreSQL cannot be queried.
- Upload failure: confirm the attachment volume is mounted and has free space; the runtime prepares `/data/attachments` for the unprivileged API process.
- Retention partial failure: the operational day remains in `FAILED` retention state. Correct storage access, preview again, and rerun; missing files are idempotent success.
- Schedule save rejected: overlap is allowed. Inspect the reported uncovered gap and keep active shifts covering every minute of the 24-hour cycle.

## Release checklist

- Generated API client is clean after `npm run api:generate`.
- Full checks, integration tests, production audit, builds, Compose config, image builds, and browser journeys pass.
- Backup and restore are drilled against disposable volumes.
- No credentials, local database files, attachments, backups, `dist`, or `node_modules` are committed.
- A human owner reviews the final diff and validation limitations before declaring a pull request ready.
