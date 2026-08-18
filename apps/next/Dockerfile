# syntax=docker/dockerfile:1

FROM dhi.io/node:24-alpine-dev AS base

RUN corepack enable

WORKDIR /workspace


FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/next/package.json apps/next/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile


FROM dependencies AS build

ARG VERSION=0.0.0

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_VERSION=${VERSION}

COPY apps/next ./apps/next

RUN pnpm --filter @templates/next build


FROM dhi.io/node:24-alpine AS runtime

ARG VERSION=0.0.0

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${VERSION}

LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

COPY --from=build \
    --chown=65532:65532 \
    /workspace/apps/next/public \
    ./public

COPY --from=build \
    --chown=65532:65532 \
    /workspace/apps/next/.next/standalone \
    ./

COPY --from=build \
    --chown=65532:65532 \
    /workspace/apps/next/.next/static \
    ./apps/next/.next/static

EXPOSE 3000

CMD ["node", "apps/next/server.js"]