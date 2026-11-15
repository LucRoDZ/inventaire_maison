# syntax=docker/dockerfile:1
# Build context: repository root.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM deps AS build
# Rewrites are resolved at build time by Next.js.
ARG API_INTERNAL_URL=http://inventaire-api:3001
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=$API_INTERNAL_URL
COPY tsconfig.base.json tokens.css ./
COPY scripts/copy-zxing-wasm.mjs scripts/
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @inventaire/shared && npm run build -w @inventaire/web

FROM node:24-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
