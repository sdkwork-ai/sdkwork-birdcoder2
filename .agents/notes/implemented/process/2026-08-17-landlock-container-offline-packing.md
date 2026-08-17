# Agent Note: Pack the complete Landlock set for offline containers

Status: implemented

English | [中文](2026-08-17-landlock-container-offline-packing.zh.md)

## Problem

The container image installs local npm tarballs with plain npm. Packing only the Landlock entry package leaves its `workspace:*` optional dependencies unresolved, so npm fails with `EUNSUPPORTEDPROTOCOL`. Packing platform packages with pnpm can also remove executable mode from the shipped launcher.

## Decision

Docker and release verification use `native/landlock-run/scripts/pack-release.mjs`. The container uses full mode and installs the entry plus both platform tarballs from `/packs/landlock/*.tgz`; host-only release rehearsal uses `--current-platform-only`. Platform packages are packed with npm to preserve executable bits, while entry packages are packed with pnpm to convert workspace dependencies.

## Alternatives considered

**Pack only the entry package.** Plain npm rejects the unresolved workspace optional dependencies, so the container build fails before runtime verification.

**Pack every package with pnpm.** pnpm can normalize platform file modes and remove the executable bit from the launcher; npm pack is required for platform packages.

## Consequences

The Docker build validates the same three-package input that consumers receive, without registry access or npm publication. A missing platform tarball, unresolved workspace protocol, or non-executable launcher fails before the image smoke test.

## Testing

The static container verifier requires the complete packer, rejects the old entry-only command, and requires the three local tarball globs in the npm install. Landlock packed-install verification checks concrete dependency versions, launcher mode, byte identity, and the installed launcher behavior.
