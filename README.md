# Polyglot CI/CD pipeline for React and .NET repositories

This is a self-contained GitHub Actions pipeline for a polyglot monorepo. Copy its complete `.github` directory into a GitHub repository to discover React and .NET applications, validate only the applications affected by a change, create independently versioned release candidates, and promote QA-tested artifacts to production with GitHub Environment approval gates.

The pipeline deliberately keeps its implementation, Node dependencies, lockfile, and test fixtures under `.github`. It does not require a root `package.json` change and does not take ownership of the consuming repository's dependency tooling.

## What the pipeline does

| Capability | How it works |
| --- | --- |
| Application discovery | Detects React/Node applications and modern or legacy .NET projects, including their platform and tooling needs. |
| Change-aware validation | Finds direct and local-dependency changes, then builds and tests only the affected applications on pull requests and non-`main` branches. |
| Independent versioning | Maintains a SemVer history for each application using Git tags such as `portal/v1.2.0-rc.1` and `portal/v1.2.0`. |
| Release candidates | Builds, tests, packages, and publishes each changed application to a GitHub Release; Docker-enabled applications are also pushed to GHCR. |
| Controlled production release | Promotes—not rebuilds—the exact RC artifact QA tested, after independent QA and production approvals. |
| Deployment visibility | Records a successful production promotion in GitHub's **Deployments** view and links it to the configured production URL. |

## Before you install it

The target repository needs the following:

- A GitHub repository with Actions enabled.
- Trusted, persistent self-hosted runners for both Windows and Linux. Application builds default to the Windows runner; applications with a `Dockerfile` are routed to the Linux runner.
- Git, PowerShell 7 (`pwsh`), and `tar` on the runner. The pipeline uses PowerShell to inspect requested tool versions before installing Node.js. If a repository does not declare a Node or pnpm version, the corresponding tool must already be installed on the runner.
- A Docker CLI and reachable Docker daemon on the Linux runner for repositories containing applications with a `Dockerfile`.
- The relevant application tooling on the runner, such as a .NET SDK, Visual Studio/MSBuild for legacy .NET Framework projects, and any required platform SDKs.
- Permission for the Actions `GITHUB_TOKEN` to write repository contents and packages. The workflows request these permissions, but an organization or repository policy can still prevent them from being granted.
- Repository administrator access to create GitHub Environments and configure their reviewers and secrets.

The runner must be treated as trusted infrastructure. GitHub Environments protect when a job receives secrets, but self-hosted runners are not isolated between jobs; do not approve or route untrusted code to a privileged runner.

## Install in a repository

1. Copy the complete `.github` directory from this project into the root of the target repository. Keep `.github/repository-discovery`, its `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` together with `.github/workflows`.
2. Commit and push the copied files to the repository's default branch. Workflows using manual dispatch only appear in the Actions UI once their workflow file is on the default branch.
3. Register self-hosted runners with the standard `windows` and `linux` labels. The build matrix routes Docker-enabled applications to `linux` and all other applications to `windows`.
4. In the repository's **Settings → Actions → General**, ensure Actions are allowed and that workflow tokens can receive the write permissions requested by the release workflows. If the organization enforces read-only tokens, allow `contents: write` and `packages: write` for these workflows.
5. Configure the three GitHub Environments described in [Deployments and approval gates](#deployments-and-approval-gates) before allowing release-candidate or production workflows to run.
6. Open **Actions** and manually run **Validation — Validate changed applications** once. This verifies discovery and shows the application IDs used by the release workflows.

No changes are needed to the target repository's root `package.json`. The pipeline reads existing repository configuration to select application tool versions and runs its own support tooling from `.github/repository-discovery`.

## Repository conventions the pipeline expects

- **Node applications:** a `package.json` identifies an application. The pipeline uses pnpm for application dependency installation and runs optional `build` and `test` scripts. A releaseable Node application must emit `dist`, `build`, or `out`.
- **Modern .NET applications:** an SDK-style `.csproj` is built and tested with `dotnet`, then packaged from `dotnet publish` output.
- **Legacy .NET applications:** a non-SDK `.csproj` requires MSBuild on the runner and is packaged from `bin/Release`.
- **Docker-enabled applications:** place a `Dockerfile` in an application directory. The image build uses the repository root as context, which supports monorepo `COPY` instructions.
- **Tool versions:** Node and pnpm are discovered from repository configuration (`.nvmrc`, `.node-version`, `package.json`, and related fields); .NET uses the nearest `global.json`. If no version is declared, the installed runner tool is used.

### Explicit CI/CD participation

Discovery remains automatic by default. To explicitly retain a detected project in CI/CD, add this property to any modern or legacy MSBuild project file:

```xml
<PropertyGroup>
  <cicd>true</cicd>
</PropertyGroup>
```

To exclude a detected .NET project, use `<cicd>false</cicd>` instead. The setting value is case-insensitive and works with the legacy MSBuild XML namespace as well as SDK-style project files. The earlier uppercase `<CICD>` spelling is also accepted for compatibility.

For a detected React/JavaScript application, use a JSON boolean in its `package.json`:

```json
{
  "cicd": true
}
```

Set `"cicd": false` to exclude it. Omitting either property preserves the pipeline's existing automatic detection behavior. Invalid values, including JSON strings such as `"false"`, are ignored with a warning so an existing application is not accidentally removed.

The application ID is based on its directory path and is stable across releases. For example, `apps/customer-portal` becomes `customer-portal`, which produces tags such as `customer-portal/v1.0.0-rc.1` and the GHCR package path `ghcr.io/<owner>/<repository>/customer-portal`.

## First-run checklist

After installation, use this sequence to confirm the setup:

1. Push a small change to a non-`main` branch and confirm **Validation — Validate changed applications** discovers and builds the expected application(s).
2. Open a pull request and confirm the same affected-application validation runs. Fork pull requests intentionally run discovery only, protecting the self-hosted runner from untrusted code.
3. From Actions, run `Generate Release Candidate Artifacts` and supply the full commit SHA. It selects applications changed since their own last RC and pauses at the `release-candidate` approval gate.
4. Approve the RC, then confirm it produces a prerelease in **Releases** and, for Docker applications, a matching GHCR image.
5. QA test that RC. Start **Promote Release Candidate to Production** manually with the RC tag, approve the `qa` and `production` gates, and confirm the final release and deployment appear in GitHub.

If an application is not discovered, first run the validation workflow and inspect its job summary. It lists discovered application paths, IDs, project systems, target frameworks, and tooling requirements.

## Workflow map

| Workflow | When to use it | Result |
| --- | --- | --- |
| `Validation — Validate changed applications` | Pushes and pull requests | Discovers applications and builds/tests affected applications. |
| `Validation — Build affected applications manually` | A manual validation run | Builds a selected discovered set without creating a release. |
| `Generate Release Candidate Artifacts` | Manual run with a full commit SHA | Queues RCs for applications changed at that commit; each build waits for release-candidate approval. |
| `Release — Create a candidate manually` | Hotfixes, explicit bump levels, or a specific ref | Queues an approved RC build for one application. |
| `Generate Development Artifacts` | Testing a successful non-`main` validation result | Rebuilds that result's affected applications as temporary dev-test artifacts; does not version or create a release. |
| `Promote Release Candidate to Production` | After QA validates an RC on `main` | Requires QA then production approval, promotes the tested bytes to final, and records the production deployment. |
| `Release — Generate environment manifest` | Automatically after a successful RC or production promotion; also manually | Publishes the current QA and production release inventory as JSON. |

## Local maintenance and verification

The pipeline's implementation can be checked independently of the consuming repository:

```sh
cd .github/repository-discovery
pnpm install --frozen-lockfile
pnpm run typecheck:discovery
pnpm run test:discovery
```

Run these after modifying the pipeline's TypeScript or workflow contracts. The repository-discovery tests include fixture applications and workflow-contract tests; they do not build the consuming repository's applications.

## Discovery implementation details

Cross-platform TypeScript discovery for React and .NET applications in a polyglot monorepo. The workflow-related implementation is grouped under `.github/repository-discovery`. Copy the complete `.github` directory into a repository to use the pipeline; its package manifest, lockfile, dependencies, and test commands are self-contained there. No root `package.json` changes are required. All commands below run from `.github/repository-discovery` after the initial `cd`. Discovery runs on Linux or Windows; build requirements are recorded separately in the manifest.

```sh
cd .github/repository-discovery
pnpm install --frozen-lockfile
pnpm run typecheck:discovery
pnpm run test:discovery
pnpm exec tsx src/cli.ts ../.. --output .github/repository-discovery/discovery-manifest.json
```

In GitHub Actions, add `--summary` to publish a detailed Markdown report to the workflow run summary. The included workflow does this automatically:

```sh
pnpm exec tsx src/cli.ts ../.. --output .github/repository-discovery/discovery-manifest.json --summary
```

The summary includes each application’s path, project system, target frameworks, platform/tool requirements, and relevant project/package files.

Before discovery creates manifests, the workflow type-checks and tests the repository-discovery implementation. A failure stops the workflow before it can publish artifacts or dispatch application builds.

The pipeline's own `pnpm-workspace.yaml` establishes an independent workspace, so installation and script execution cannot accidentally use the consuming repository's workspace dependencies or lockfile. It excludes the test fixture packages and explicitly permits esbuild's required install script. Keep this file when copying the pipeline; newer pnpm versions no longer read workspace-isolation settings from `.npmrc`.

## Dependency and change discovery

Generate an affected-application manifest from two Git refs:

```sh
pnpm exec tsx src/affected-cli.ts --root ../.. --base origin/main --head HEAD --output .github/repository-discovery/affected-manifest.json
```

The command resolves local Node package dependencies from `package.json` files and .NET dependencies from `ProjectReference` entries. It reports applications changed directly and applications affected transitively through local dependencies. It uses Node's process API to invoke Git, so it works on Windows and Linux runners.

On non-`main` pushes, the comparison baseline is the most recent successful integrated `Validation — Validate changed applications` run on the same branch. That workflow includes the affected-application build-and-test matrix, so a failed build does not advance the baseline: later pushes continue to rebuild applications changed since the last validated commit. The first push after this flow is enabled, the first push to a branch, a rewritten branch history, or an unavailable baseline triggers full validation. On pull requests, the comparison is from the PR base SHA to its head SHA, so only directly or transitively affected applications are validated before merge.

On push runs, the included workflow adds an **Applications to rebuild and version** table to the GitHub Actions job summary. It identifies each affected application and whether a direct file change or a dependency change caused it to be selected.

## Affected build and test

Tool versions come from the consuming project. Discovery and matrix preparation read the repository root; application builds search from the application directory up to the root, with nearer declarations taking precedence. Node is read from `.nvmrc`, `.node-version`, then `package.json` (`volta.node` or `engines.node`). pnpm is read from `packageManager`, `devEngines.packageManager`, or `engines.pnpm`. The nearest `global.json` selects the .NET SDK, and .NET commands run from the application directory so SDK resolution honors that file.

When a version is not declared, the pipeline keeps the self-hosted runner's installed tool instead of choosing a fixed version. PowerShell reads these settings before dependency installation, so Node does not need to be preinstalled when the repository declares its Node version. pnpm must be installed on the runner if no pnpm version is declared. Selected versions must support the pipeline's dependencies and lockfile; incompatible versions fail validation rather than being silently replaced. Node application builds currently use pnpm; npm/Yarn declarations do not select a different package manager. MSBuild continues to use the installed Visual Studio toolchain.

`Validation — Validate changed applications` has two dependent jobs: it first discovers applications and selects the affected set, then builds and tests that set in a matrix within the same workflow run. Ordinary pushes and pull requests include only affected applications; manual runs and a branch's first push select every discovered application for full validation. Each selected Node application runs its optional `build` and `test` package scripts. SDK-style .NET projects run `dotnet build` and `dotnet test`; legacy MSBuild projects run `msbuild` on the Windows runner. When an application directory contains a file named `Dockerfile`, that matrix entry—including its application build and tests—runs on the Linux runner, then runs `docker build` with the repository root as context and removes the temporary image. Automatic non-`main` branch runs do not retain or publish Docker images or any other deployable artifact. To preserve the existing security boundary, pull requests from forks run discovery only; the build matrix runs for branch pushes and same-repository pull requests. The separate `Validation — Build affected applications manually` workflow remains available for explicit manual runs.

The detector interface is intentionally small (`Detector.detect(context)`), so additional ecosystems can be added without coupling discovery to GitHub Actions. Paths are repository-relative and normalized to `/`; application IDs and application ordering are deterministic.

Detected .NET signals include SDK-style projects, legacy MSBuild projects, classic ASP.NET (`web.config`/`System.Web`), WPF, and WinForms. Legacy desktop and classic ASP.NET projects are marked with Windows/MSBuild requirements.

## Application names

Application names require no configuration. Discovery uses the application directory as the stable publishing ID and as the basis for the human-readable label: `apps/api/DotNetWebAPI.Api.csproj` becomes **API** with ID `api`; `apps/customer-portal` becomes **Customer Portal** with ID `customer-portal`. These IDs are used for release tags, release assets, concurrency groups, and GitHub Container Registry package paths.

If two applications have the same directory name, discovery automatically includes parent directory segments to keep their IDs distinct. If they are still in the same directory, it falls back to the full project-derived ID. Existing path-derived release tags are recognized when calculating the next release candidate and automatic-release baseline, so the first friendly-ID release continues the previous version sequence rather than restarting it.


## Versioning

Each application is versioned independently under SemVer 2.0, tracked entirely as git tags of the form `<app-id>/vX.Y.Z` (final) and `<app-id>/vX.Y.Z-rc.N` (release candidate) — no files are edited or committed. The actual build/test/publish/tag steps live once, in the reusable `.github/workflows/build-and-publish-release-candidate.yml` (`workflow_call`), so the manual and automatic paths below never duplicate that logic.

- **DEV-test artifacts** are built only by manually running `.github/workflows/publish-development-artifacts.yml` with the ID of a successful integrated non-`main` `Validation — Validate changed applications` run. The workflow verifies that the supplied run is a successful non-`main` branch push from the integrated validation flow, then rebuilds exactly that run's affected applications. Each deployable application output is uploaded as a GitHub Actions artifact retained for 30 days. Applications with Dockerfiles are also published to GitHub Container Registry as `ghcr.io/<owner>/<repository>/<app-id>:dev-<normalized-branch>-<commit-sha>`, where the branch segment is lowercased and made safe for a container tag. These are dev-test outputs: they create neither a Git tag nor a GitHub Release.
- **Release candidates from a commit** (`.github/workflows/create-release-candidates-from-main.yml`) run only when started manually from the Actions tab. Provide the full Git commit SHA; the workflow finds every application that changed — directly or via a dependency — since *that application's own* last release-candidate build (any bump level, whether or not it was ever promoted; see `src/auto-rc.ts`) and creates an RC for each one independently at a fixed `minor` bump. It is serialized per requested commit, and one application's build or test failure never blocks or cancels the others. An application with no RC tag yet always gets one (first-ever build), while one whose last RC already points at the supplied commit is skipped rather than rebuilt.
- **Single-application release candidates** (`.github/workflows/create-release-candidate-manually.yml`) remain available for one application id at a time, from a branch, tag, or commit SHA, with a chosen bump level (`major`/`minor`/`patch`, default `minor`) and optional `initial_version`. Use this when an explicit versioning choice is needed.
- In both cases, the target version is always the app's latest **final** tag bumped by the selected level — never bumped from an outstanding, unpromoted rc. If an rc series for that exact target already exists, this continues it at the next `rc.N`; otherwise it starts at `rc.1`. An application with no final tag yet starts at `0.1.0` (or, for the manual workflow, an explicit `initial_version` input). Once the build and tests pass, the app's deployable build output — a React app's static `dist`/`build`/`out` directory, or a .NET app's `dotnet publish` output (the runnable `.exe` for a desktop app, or the dll + wwwroot a web API deploys from) — is tarred and published as an asset on a **GitHub Release** tagged `<app-id>/v<version>` (`src/artifact-publish-cli.ts` / `src/github-releases.ts`) — creating that release also creates the underlying git tag at the exact built commit, so there's no separate tag/push step.
- **Promotion to final** (`.github/workflows/promote-release-candidate-to-production.yml`) is a separate manual step, taken after the rc's commit has already been merged to `main` through the normal PR flow — it is not the merge itself. It downloads the exact artifact published for the rc (`src/artifact-fetch-cli.ts`) and re-publishes those same bytes as a new release under the final version — never rebuilt from source — so what passed QA is what ships. A final tag is immutable: promotion fails if that final tag already exists.

**Artifact storage is GitHub Releases for now**, chosen as a working default with no extra infrastructure or credentials beyond the `GITHUB_TOKEN` these workflows already have. It's swappable later without touching any versioning logic: `src/github-releases.ts` is the only place that knows about GitHub's REST API, and `artifact-publish-cli.ts` / `artifact-fetch-cli.ts` are the only two callers — replace their bodies to point at a different registry (npm, NuGet, blob storage, whatever) and nothing else in the pipeline needs to change. The only runner dependency is `tar` (ships with Windows 10+ and Linux, already relied on here), used to package each app's resolved deployable output directory (not its source tree) into a single asset.

## Deployments and approval gates

The pipeline uses GitHub **Environments** to gate and record releases. The approval rules and secrets are configured in GitHub, not committed to this repository. A job does not start, and cannot read its environment secrets, until that environment's protection rules pass.

### Required repository setup

Before enabling these workflows, ensure the repository has GitHub Actions enabled and has a registered self-hosted runner with the tools described above. Repository administrators must create the following environments at **Settings → Environments**:

| Environment | What it protects | Recommended configuration |
| --- | --- | --- |
| `release-candidate` | The actual release-candidate build, test, version, and publish job | Add the release manager/team as required reviewers. Do not restrict deployment branches if manual candidates may be built from hotfix branches. |
| `qa` | The decision that a tested release candidate may be promoted | Add the QA team as required reviewers and enable **Prevent self-review**. This is an approval gate only; it does not create a QA deployment record. |
| `production` | Final versioning, artifact promotion, and delivery to the production target | Add the operations/release team as required reviewers, enable **Prevent self-review**, and restrict deployments to the protected `main` branch. |

GitHub approves a protected environment when any one configured required reviewer approves it. If separate people must approve QA and production, configure different teams for `qa` and `production`; GitHub's native required-reviewer rule does not require every listed reviewer to approve. For private or internal repositories, environment features and required reviewers require a plan that supports them; see [GitHub's environment availability documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Create a `PRODUCTION_URL` environment variable in the `production` environment with the public URL of the deployed application, for example `https://app.example.com`. It is shown as the deployment link in GitHub. Add deployment credentials as **production environment secrets**, never as repository secrets. Typical names are `AZURE_CREDENTIALS`, `KUBECONFIG`, `SSH_PRIVATE_KEY`, or cloud-provider workload-identity settings; choose only those that match the selected hosting platform.

### Approval and release flow

1. A push to `main`, or a manual candidate request, queues the release-candidate build. It waits for a `release-candidate` approval before it consumes the runner or creates a release candidate.
2. Once the candidate passes build and tests, QA tests that published candidate.
3. A user with write access manually starts **Promote Release Candidate to Production** in the Actions tab and supplies the RC tag.
4. The run waits for `qa` approval. After QA approves it, it independently waits for `production` approval.
5. Only after production approval does the pipeline validate the tag is merged to `main`, create the final release/tag, and promote the exact RC artifact and container image. The production job is recorded in GitHub's **Deployments** view and links to `PRODUCTION_URL`.

The workflow intentionally promotes the exact bytes QA tested; it does not rebuild from source for production. This prevents a difference between the QA-tested candidate and the shipped release. Production promotions are serialized, so two releases cannot run at once.

### Add the hosting-specific delivery step

The supplied pipeline knows how to publish GitHub Release assets and GHCR images, but it cannot safely guess whether production is Azure, Kubernetes, IIS, a virtual machine, or another platform. Add the platform-specific delivery command to the `promote` job in `.github/workflows/promote-release-candidate-to-production.yml`, after the existing artifact/image promotion steps and before `Summarize`. That command can use `secrets.*` and `vars.*` from the protected `production` environment. Keep the deployment in that job: it is the job protected by the final production approval and the job GitHub records as the production deployment.

For more detail on approving a pending deployment, see [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments). Environment approval allows a job to proceed; it does not automatically launch a separate workflow, which is why the promotion workflow is started manually after QA completes its testing.

## Environment version manifest

`Release — Generate environment manifest` runs after each successful release-candidate workflow and after each successful production promotion. It can also be started manually from the Actions tab to rebuild the inventory without releasing anything.

The workflow stores `environment-manifest.json` as an asset on the GitHub Release tagged `pipeline/environment-manifest`; it replaces the previous asset so that URL always provides the current inventory. It also uploads a copy to the individual workflow run and writes a readable table to the job summary.

The manifest release also renders three tables—DEV, QA, and production—so a reader can see every application and the version that should be deployed without downloading JSON. The JSON asset remains the machine-readable source.

The manifest reports one entry for every discovered application:

- `dev` and `qa` use the highest release candidate whose matching final version has not been promoted. If no unpromoted RC exists, they show the newest production version as the **production baseline** to deploy.
- `production` is the highest final release version for the application.

Each available QA or production entry includes the version, immutable tag, and source commit. The JSON is an intended-release inventory derived from release tags; it is not evidence that a hosting platform actually received the artifact. Once target-specific deployment commands are added, use the same manifest format (or a target-hosted copy) to record the confirmed deployed version as well.
