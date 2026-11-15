FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build -w @nighty/web

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
