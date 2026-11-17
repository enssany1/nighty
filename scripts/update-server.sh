#!/usr/bin/env bash
# Updates a running Nighty Docker Compose deployment to the latest published code.
#
# Run it on the server that hosts Nighty:
#   curl -fsSL https://raw.githubusercontent.com/enssany1/nighty/main/scripts/update-server.sh | bash
#
# It finds the running deployment, backs up the database, replaces the source with the
# latest main branch, and rebuilds the containers with the same Compose files and
# database settings. It stops before changing anything if the deployment is not found.
set -euo pipefail

PROJECT="${NIGHTY_PROJECT:-nighty}"
REPOSITORY="${NIGHTY_REPOSITORY:-https://github.com/enssany1/nighty}"
BRANCH="${NIGHTY_BRANCH:-main}"

say() { printf '\n==> %s\n' "$*"; }
container() { docker ps -q --filter "label=com.docker.compose.project=${PROJECT}" --filter "label=com.docker.compose.service=$1" | head -n 1; }
label() { docker inspect -f "{{ index .Config.Labels \"$2\" }}" "$1"; }
setting() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p" | head -n 1; }

command -v docker >/dev/null || { echo "Docker is not installed on this machine." >&2; exit 1; }
API="$(container api)"; DATABASE="$(container postgres)"; WEB="$(container web)"
if [ -z "$API" ] || [ -z "$DATABASE" ] || [ -z "$WEB" ]; then
  echo "No running Nighty deployment (Compose project '${PROJECT}') was found. Nothing was changed." >&2
  docker ps --format '  {{.Names}}  ({{.Image}})' >&2
  exit 1
fi

DIRECTORY="$(label "$API" com.docker.compose.project.working_dir)"
CONFIG_FILES="$(label "$API" com.docker.compose.project.config_files)"
[ -d "$DIRECTORY" ] || { echo "Deployment folder '${DIRECTORY}' does not exist. Nothing was changed." >&2; exit 1; }
COMPOSE=(docker compose -p "$PROJECT" --project-directory "$DIRECTORY")
IFS=',' read -r -a FILES <<< "$CONFIG_FILES"
for file in "${FILES[@]}"; do COMPOSE+=(-f "$file"); done

# Reuse the settings of the running deployment so the rebuild matches it exactly.
export POSTGRES_USER="$(setting "$DATABASE" POSTGRES_USER)"
export POSTGRES_DB="$(setting "$DATABASE" POSTGRES_DB)"
export POSTGRES_PASSWORD="$(setting "$DATABASE" POSTGRES_PASSWORD)"
[ -n "$POSTGRES_PASSWORD" ] || { echo "Could not read the database settings of the running deployment. Nothing was changed." >&2; exit 1; }
if [ -z "${VITE_BASE_PATH:-}" ]; then
  if [ -f "$DIRECTORY/.env" ] && grep -q '^VITE_BASE_PATH=' "$DIRECTORY/.env"; then
    VITE_BASE_PATH="$(sed -n 's/^VITE_BASE_PATH=//p' "$DIRECTORY/.env" | head -n 1 | tr -d "\"'")"
  else
    # The web image only records the base path inside its built files.
    VITE_BASE_PATH="$(docker exec "$WEB" sh -c 'cat /usr/share/nginx/html/index.html 2>/dev/null' | sed -n 's|.*src="\(/[^"]*\)assets/index-[^"]*\.js".*|\1|p' | head -n 1)"
  fi
fi
export VITE_BASE_PATH="${VITE_BASE_PATH:-/}"

say "Deployment folder: ${DIRECTORY}"
echo "    Compose files:  ${CONFIG_FILES}"
echo "    Base path:      ${VITE_BASE_PATH}"

BACKUP="${NIGHTY_BACKUP_DIRECTORY:-$HOME/nighty-backups}/nighty-$(date -u +%Y%m%dT%H%M%SZ).dump"
say "Backing up the database to ${BACKUP}"
mkdir -p "$(dirname "$BACKUP")"
docker exec "$DATABASE" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP"
[ -s "$BACKUP" ] || { echo "The database backup is empty. Nothing was changed." >&2; exit 1; }

say "Downloading ${REPOSITORY} (${BRANCH})"
DOWNLOAD="$(mktemp -d)"; trap 'rm -rf "$DOWNLOAD"' EXIT
if command -v curl >/dev/null; then curl -fsSL "${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz" -o "$DOWNLOAD/source.tar.gz"
else wget -q "${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz" -O "$DOWNLOAD/source.tar.gz"; fi
mkdir "$DOWNLOAD/source"
tar -xzf "$DOWNLOAD/source.tar.gz" -C "$DOWNLOAD/source" --strip-components=1
[ -f "$DOWNLOAD/source/compose.yaml" ] || { echo "The download does not look like Nighty. Nothing was changed." >&2; exit 1; }
# Files that exist only on the server, such as .env, are left untouched.
cp -a "$DOWNLOAD/source/." "$DIRECTORY/"

say "Rebuilding and restarting Nighty"
"${COMPOSE[@]}" up -d --build

say "Waiting for Nighty to become healthy"
for attempt in $(seq 1 60); do
  STATE="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(container web)" 2>/dev/null || true)"
  [ "$STATE" = "healthy" ] && break
  sleep 5
done
"${COMPOSE[@]}" ps
if [ "${STATE:-}" = "healthy" ]; then say "Nighty is updated and healthy. Database backup: ${BACKUP}"
else echo "Nighty did not report healthy yet. Check: ${COMPOSE[*]} logs --tail 100 api" >&2; exit 1; fi
