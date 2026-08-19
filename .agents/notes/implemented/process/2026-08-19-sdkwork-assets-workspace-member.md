# Agent Note: Join sdkwork-assets as a workspace sibling

Status: implemented

English | [中文](2026-08-19-sdkwork-assets-workspace-member.zh.md)

## Problem

`@sdkwork/agents-pc-core` declares `@sdkwork/assets-app-sdk` as `workspace:*`. The agents sibling already joins that package from `../sdkwork-assets`, but BirdCoder's `pnpm-workspace.yaml` did not. `pnpm run` then treated the specifier as a missing workspace package, attempted a registry fetch, and failed the pre-script install check when `registry.npmjs.org` connections were destroyed.

## Decision

BirdCoder joins `../sdkwork-assets/sdks/sdkwork-assets-app-sdk/sdkwork-assets-app-sdk-typescript` as a dependency-resolution workspace member, pins `sdkwork-assets` at `7c2ab7c30fbf44de0dc7e0396d4b252088505095` in `scripts/sdkwork-sources.manifest.json`, and copies that sibling into the container build from the `sdkwork-ecosystem` context. The package remains source-only: tsdown globs still exclude sibling SDK families.

## Alternatives considered

**Leave the specifier unresolved and fetch `@sdkwork/assets-app-sdk` from the npm registry.** The package is private source consumed through sibling checkouts; registry resolution fails when the name is unpublished or the network path to npmjs.org is destroyed.

**Drop the agents-pc-core assets SDK dependency.** The assets client lives in that package (`assetsAppSdkClient.ts`) and is the owned consumer of the generated facade; removing the dependency would break the agents composition rather than the workspace join.

**Point BirdCoder at a local path alias without a workspace member.** pnpm `workspace:*` requires the package to appear in `pnpm-workspace.yaml`; a tsconfig path would not satisfy install-time resolution.

## Consequences

A missing `sdkwork-assets` checkout now fails as an incomplete sibling layout instead of a registry timeout. Adding or bumping this sibling still requires the same coordinated pin, workspace member, lockfile, and Dockerfile copies as the other SDKWork repositories.

## Testing

`pnpm run verify-sdkwork-dependencies` accepts the new pin and workspace member. `pnpm install` links `@sdkwork/assets-app-sdk` from the sibling checkout without resolving it from the registry.
