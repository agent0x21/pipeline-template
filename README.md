# Pipeline Template

This Windows-oriented monorepo contains a React dashboard, an ASP.NET Core API, a WPF desktop application, and a shared TypeScript package.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React 19 + TypeScript frontend built with Vite |
| `apps/api` | ASP.NET Core 10 API exposing `/weatherforecast` |
| `apps/desktop` | .NET 10 WPF desktop application |
| `packages/shared` | Shared TypeScript utilities and application constants |
| `Jenkinsfile` | Jenkins release/build pipeline definition |
| `Jenkinsfile.promote` | Jenkins artifact-promotion pipeline definition |

The web dashboard displays the API connection status and a five-day weather forecast.

## Prerequisites

- Node.js and pnpm 12.3.4
- .NET 10 SDK
- Windows for the WPF desktop project

```powershell
pnpm install --frozen-lockfile
```

## Run locally

```powershell
pnpm start-api
pnpm dev-web
```

The frontend uses `http://localhost:5130/weatherforecast` during Vite development. The API allows the Vite development and preview origins on ports 5173 and 4173.

Run the desktop application with `dotnet run --project .\apps\desktop`.

## Build and check

```powershell
pnpm --filter ./apps/web lint
pnpm build-web
pnpm build-api
dotnet build .\apps\desktop -c Release
```

Use `pnpm serve-web` to preview `apps/web/dist`.

## Frontend runtime configuration

Place `runtime-config.json` beside the deployed frontend files:

```json
{"apiUrl":"https://api.example.com/weatherforecast"}
```

Missing configuration falls back to same-origin `/weatherforecast` in production. Different hosts require matching API CORS configuration.

## API container

```powershell
pnpm test-container-api
```

This builds the API image, checks `/weatherforecast` on port 8088, and removes the test container. Docker with Linux-container support is required.

```text
pnpm dev-web       # Start the frontend
pnpm build-web     # Build the frontend
pnpm start-api     # Run the API
pnpm build-api     # Build the API
pnpm build         # Build frontend and API
```

The `.slnx` solution includes the API and desktop projects. No application test projects are currently present.

## Release automation

The Jenkinsfiles describe build, packaging, review, tagging, registry publication, and immutable artifact promotion. They expect `.releasepipeline.yml` and `eng/ci/*`, which are not present in this checkout; therefore the release commands in `package.json` are not locally runnable at this revision.
