# syntax=docker/dockerfile:1

FROM node:24-alpine AS base

RUN corepack enable

WORKDIR /workspace


FROM base AS build

ARG VERSION=0.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @templates/express build

RUN pnpm \
    --filter @templates/express \
    --prod \
    deploy /deploy/express


FROM node:24-alpine AS runtime

ARG VERSION=0.0.0

ENV NODE_ENV=production
ENV PORT=3001
ENV APP_VERSION=${VERSION}

LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

COPY --from=build \
    --chown=node:node \
    /deploy/express \
    ./

USER node

EXPOSE 3001

HEALTHCHECK \
    --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]