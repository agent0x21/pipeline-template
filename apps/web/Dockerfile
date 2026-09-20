FROM node:24-bookworm-slim AS build
WORKDIR /src

RUN npm install --global pnpm@12.3.4

# The pipeline supplies the repository root as the build context.
COPY . .

RUN pnpm install --frozen-lockfile

ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ENV VITE_APP_VERSION=$APP_VERSION \
    VITE_APP_COMMIT=$APP_COMMIT

RUN pnpm --filter ./apps/web build

FROM nginx:stable-alpine
COPY --from=build /src/apps/web/dist/ /usr/share/nginx/html/