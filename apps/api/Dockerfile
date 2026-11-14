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
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @inventaire/shared && npm run build -w @inventaire/api

FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts -w @inventaire/api -w @inventaire/shared

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
RUN mkdir -p /data/images && chown node:node /data/images
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
