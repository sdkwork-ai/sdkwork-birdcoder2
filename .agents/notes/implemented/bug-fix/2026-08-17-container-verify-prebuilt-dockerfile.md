# Agent Note: Container verify must match the prebuilt image stage

Status: implemented

English | [中文](2026-08-17-container-verify-prebuilt-dockerfile.zh.md)

## Problem

`scripts/release/verify-container.ts` still required `pnpm run build` inside `Dockerfile`. The image stage now copies a runner-built tree through the `prebuilt` Buildx context and only packs release tarballs there. Tagged `birdcoder-v*` publication failed at "Verify deployment and release definitions" before desktop or container assets could assemble.

## Decision

Align the static verifier with the shipped Dockerfile and release workflow:

- Require `COPY --from=sdkwork-ecosystem` then `COPY --from=prebuilt`, then the existing pack / `npm install` / smoke ordering.
- Forbid `pnpm run build` and `pnpm install` inside the Dockerfile so the image cannot silently regress to an in-image workspace build.
- Require the release workflow to build on the runner and pass both `prebuilt` and `sdkwork-ecosystem` named contexts into Buildx.

Update the sibling-checkout Agent Note fact that described an in-image `pnpm install` after the sibling copy.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Put `pnpm run build` back into the Dockerfile | Reintroduces the sibling-install failure the prebuilt context removed |
| Skip `verify:container` in the bundle job | Removes the gate that caught this contract drift |

## Consequences

- `pnpm run verify:container` passes against the current Dockerfile and `container-release.yml`.
- A future Dockerfile that rebuilds the workspace in-image fails the gate before publication.
