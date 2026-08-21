# Agent Note: CI checkout of the SDKWork ecosystem siblings

Status: implemented

English | [中文](2026-08-17-ci-sdkwork-sibling-checkouts.zh.md)

## Problem

The SDKWork integrations (ui-sdkwork-iam, ui-sdkwork-feedback, ui-sdkwork-env) consume the `@sdkwork/*` packages as raw source through pnpm workspace members listed in `pnpm-workspace.yaml` as `../sdkwork-*` siblings. That layout works on a developer machine but not in CI: GitHub Actions checks out only this repository, so every install-and-build job resolved the sibling members as dangling links and the workspace build (tsdown inlines the real sdkwork sources into the ui-sdkwork-iam client bundle) failed. Two alternatives were ruled out first: package-level git dependencies cannot select a monorepo member (pnpm rejects the `#path=` syntax and the slash form), and the sdkwork packages are unpublished on npm except the app SDK and sdk-common. The sibling repos are all public except `sdkwork-appbase` (private), and the build closure needs three packages from it, so CI cannot clone it with the default `GITHUB_TOKEN`, which never crosses repositories.

## Decision

CI clones the siblings beside the checkout, mirroring the developer layout, through one composite action that every install-and-build job calls:

- `.github/actions/setup-sdkwork-siblings` clones the seven sibling repositories at pinned refs (the refs the current integration was developed against) into the checkout's parent directory, so the existing `../sdkwork-*` workspace globs and `tsconfig.base.json` paths resolve unchanged. The refs live in the action; bump them together with local development checkouts.
- The clone authenticates with `secrets.SDKWORK_GITHUB_TOKEN`, a repository secret holding an account token with read access to the private `sdkwork-appbase` (the same-account access model; replacing it with a scoped fine-grained PAT is the follow-up). Steps are guarded with `if: secrets.SDKWORK_GITHUB_TOKEN != ''` so fork pull requests, where secrets are unavailable, skip the clone instead of failing the step.
- The container image build receives the siblings through a buildx named context (`sdkwork-ecosystem`): the container-image job checks the repository out into a `repo/` subdirectory so the named context path stays inside the workspace, and the Dockerfile copies the seven sibling trees into the build stage. The workspace install and build run on the runner; a second named context (`prebuilt`) supplies that proven tree so the image stage only packs release tarballs and installs the standalone runtime.
- The workflows that run a workspace install and build (ci, release, desktop-release, container-release, e2e, e2b-e2e, sandbox, docs-pages, build-exe-for-python-sdk) gained the step; workflows that never build the sdkwork-dependent client packages (landlock-run, release-vendor, pi-ai-provider-e2e) did not, since a frozen install tolerates the dangling sibling links.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Package-level git dependencies | pnpm cannot select a monorepo subdirectory (`#path=` and slash forms both fail) |
| Clone in CI without credentials | `sdkwork-appbase` is private and `GITHUB_TOKEN` never crosses repositories |
| Vendor the sdkwork source into this repository | Copies content and adds an upstream-sync burden; the CI-clone layout keeps the sibling checkouts as the single source of truth |
| Ship the release without the SDKWork integrations | Removes shipped account and feedback surfaces from the installers |

## Consequences

- The release pipeline (desktop matrix, container images, Compose/Kubernetes bundle) can build in CI; the pinned sibling refs make the builds deterministic.
- Local development keeps the same `../sdkwork-*` layout; nothing about the workspace or build configuration changed for developers.
- The token is the user's account token with broad scopes — replace it with a read-only fine-grained PAT scoped to the seven sibling repositories as follow-up.
- Bumping a sibling checkout requires updating the pinned ref in `.github/actions/setup-sdkwork-siblings/action.yml` together with the local checkout.
