# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace managed with Nx and contains independent service templates under `apps/`:

- `apps/react`: Vite + React frontend, with static assets in `public/` and source in `src/`.
- `apps/next`: Next.js application, with App Router code in `src/app/`.
- `apps/express`: TypeScript Express API, with entry code in `src/`.
- `apps/dotnet-api`: ASP.NET Core API, with controllers and configuration alongside the project file.

Root-level workflow and automation files live in `.github/`; keep generated output such as `dist/`, `.next/`, `bin/`, and `obj/` out of commits.

## Build, Test, and Development Commands

Install the pinned package manager version (`pnpm@10.33.0`) and dependencies with `pnpm install`. Useful commands include:

- `pnpm dev:react`, `pnpm dev:next`, `pnpm dev:express`: run the selected Node service locally.
- `pnpm dev:dotnet`: run the .NET API with watch mode.
- `pnpm build`: build all Node workspace packages and the .NET API.
- `pnpm build:react`, `pnpm build:next`, `pnpm build:express`, `pnpm build:dotnet`: build one service.
- `pnpm --filter @templates/react lint` or `pnpm --filter @templates/next lint`: run frontend ESLint.
- `pnpm --filter @templates/express typecheck`: run the Express TypeScript check without emitting files.

## Coding Style & Naming Conventions

Use 2-space indentation and follow the existing TypeScript/TSX, C#, and configuration-file style. Use PascalCase for React components and C# types, camelCase for TypeScript variables/functions, and kebab-case for route or asset names where appropriate. Keep service-specific changes inside their `apps/<service>` directory. Run the relevant linter or type check before opening a PR.

## Testing Guidelines

No automated test framework or test suites are currently configured. When adding behavior, add tests alongside the affected service and document the command used to run them. Until then, verify changes with the applicable build, lint, typecheck, and local smoke test.

## Commit & Pull Request Guidelines

Use short Conventional Commit-style messages, matching the existing history: `feat:`, `fix:`, `refactor:`, or similar, followed by an imperative description (for example, `fix: correct health endpoint response`). PRs should explain the affected service(s), summarize validation commands and results, link related issues when applicable, and include screenshots for visible UI changes.

## Configuration & Security

Do not commit secrets, tokens, or production connection strings. Keep environment-specific settings in local or deployment configuration, review changes to `appsettings*.json`, and update relevant Dockerfiles or GitHub Actions workflows when a service’s build/runtime requirements change.
