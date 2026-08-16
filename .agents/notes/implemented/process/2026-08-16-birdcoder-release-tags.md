# Agent Note: BirdCoder release tags

Status: implemented

English | [中文](2026-08-16-birdcoder-release-tags.zh.md)

## Problem

GitHub Releases in this repository used the upstream tag prefix `dsh-v` (`dsh-v0.1.0-rc.12`), while the packaged product and its download URLs are branded BirdCoder. The release workflow trigger, the npm release family prefix, the GitHub Latest selector, the desktop auto-updater, and the installation docs all carried a tag form that no longer matches the product identity.

## Decision

The canonical release tag prefix is now `birdcoder-v`. Pushing `birdcoder-v<version>` runs the [release workflow](../../../../.github/workflows/container-release.yml) and publishes the unified GitHub Release with the complete Desktop and container asset set. The dsh release family `tagPrefix` in [families.ts](../../../../scripts/release/families.ts) is `birdcoder-v`, so npm release verification and tag bumping use the same tags as the GitHub Release.

The [Latest selector](../../../../scripts/release/select-github-latest.ts) and the [patched electron-updater GitHubProvider](../../../../patches/electron-updater@6.8.9.patch) keep recognizing the legacy `dsh-v` and `v` prefixes: already-published releases remain selectable for the Latest pointer and remain discoverable by the desktop updater. On an equal-precedence tie the canonical `birdcoder-v` tag wins. The updater spec keeps a legacy `dsh-v` feed entry to prove the backward compatibility. Installation docs, download base URLs, and the desktop asset guide now spell `birdcoder-v<version>`.

## Alternatives considered

**Keep `dsh-v` tags.** The prefix predates the fork branding; every release, download URL, and doc stays inconsistent with the BirdCoder product name.

**Rename only the GitHub Release trigger.** The npm family prefix would disagree with the workflow trigger, so a manual npm publish from the same tag would fail its release verification gate, and the Latest selector would still treat the new tags as foreign.

**Drop legacy tag support.** Existing `dsh-v` and `v` releases would disappear from Latest selection and desktop update checks, regressing published versions.

## Consequences

A `birdcoder-v<version>` tag now creates the complete GitHub Release asset set, and `dsh-v` or `v` tags no longer trigger new releases. Legacy tags remain readable for version ranking and updates. All docs and fixtures reference the `birdcoder-v` form.
