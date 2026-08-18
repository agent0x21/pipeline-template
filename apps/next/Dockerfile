# syntax=docker/dockerfile:1

FROM dhi.io/node:24-alpine AS base

RUN corepack enable

WORKDIR /workspace


FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/next/package.json apps/next/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile


FROM dependencies AS build

ARG VERSION=0.0.0

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_VERSION=${VERSION}

COPY apps/next ./apps/next

RUN pnpm --filter @templates/next build


FROM dhi.io/node:24-alpine AS runtime

ARG VERSION=0.0.0

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP_VERSION=${VERSION}

LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=build \
    --chown=nextjs:nodejs \
    /workspace/apps/next/public \
    ./public

COPY --from=build \
    --chown=nextjs:nodejs \
    /workspace/apps/next/.next/standalone \
    ./

COPY --from=build \
    --chown=nextjs:nodejs \
    /workspace/apps/next/.next/static \
    ./apps/next/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK \
    --interval=30s \
    --timeout=3s \
    --start-period=10s \
    --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "apps/next/server.js"]