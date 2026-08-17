# Agent Note: Pack the complete Landlock set for offline containers

Status: implemented

English | [中文](2026-08-17-landlock-container-offline-packing.zh.md)

## Problem

The container image installs local npm tarballs with plain npm. Its Landlock input must include the entry package and both platform packages, and each platform launcher must retain executable mode. An independent failure in the same offline install exposed published SDKWork `0.1.0` manifests whose runtime dependencies still used `workspace:*`; plain npm rejects those manifests with `EUNSUPPORTEDPROTOCOL`.

## Decision

Docker and release verification use `native/landlock-run/scripts/pack-release.mjs`. A dedicated native matrix builds both supported launchers on matching Linux runners, and each container image job assembles both artifacts into its prebuilt context before full-mode packing. The container installs the entry plus both platform tarballs from `/packs/landlock/*.tgz`; host-only release rehearsal uses `--current-platform-only`. Platform packages are packed with npm to preserve executable bits, while entry packages are packed with pnpm to convert workspace dependencies.

## Alternatives considered

**Pack only the entry package.** The offline image would omit the platform packages that the entry selects at runtime, so the installed launcher would be incomplete even when the entry manifest contains concrete optional dependency versions.

**Pack every package with pnpm.** pnpm can normalize platform file modes and remove the executable bit from the launcher; npm pack is required for platform packages.

## Consequences

The Docker build validates the same three-package Landlock input that consumers receive, without registry access or npm publication. Every packed runtime manifest is rejected when it contains `workspace:`, `catalog:`, `file:`, or `link:` dependencies. A missing platform tarball, local-only dependency protocol, or non-executable launcher fails before the image smoke test.

## Testing

The static container verifier requires the complete packer, rejects the old entry-only command, and requires the three local tarball globs in the npm install. Landlock packed-install verification checks concrete dependency versions, launcher mode, byte identity, and the installed launcher behavior.
