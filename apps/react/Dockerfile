# syntax=docker/dockerfile:1

FROM dhi.io/node:24-alpine AS build

ARG VERSION=0.0.0

ENV NODE_ENV=production
ENV VITE_APP_VERSION=${VERSION}

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/react/package.json apps/react/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile

COPY apps/react ./apps/react

RUN pnpm --filter @templates/react build


FROM dhi.io/nginx:1-alpine-dev AS runtime

ARG VERSION=0.0.0

LABEL org.opencontainers.image.version="${VERSION}"

COPY apps/react/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build \
    /workspace/apps/react/dist \
    /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK \
    --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]