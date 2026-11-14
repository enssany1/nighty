FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build -w @nighty/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec && mkdir -p /data/attachments && chown -R node:node /data
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma7.config.ts apps/api/prisma7.config.ts
COPY scripts/bootstrap-admin.mjs scripts/bootstrap-admin.mjs
COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/nighty-api-entrypoint
EXPOSE 3000
ENTRYPOINT ["nighty-api-entrypoint"]
