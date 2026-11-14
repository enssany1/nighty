#!/bin/sh
set -eu

mkdir -p /data/attachments
chown -R node:node /data/attachments
npm run prisma:migrate:deploy -w @nighty/api
su-exec node node scripts/bootstrap-admin.mjs
exec su-exec node node apps/api/dist/main.js
