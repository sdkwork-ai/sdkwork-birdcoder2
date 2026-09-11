# Agent Note: Native desktop release artifact matrix

Status: implemented

English | [中文](2026-08-14-desktop-release-artifact-matrix.zh.md)

## Problem

The desktop release workflow must provide a consistent portable format, distribution packages for Linux, coverage for each supported CPU architecture, and a machine-checkable manifest of the published bytes.

## Decision

The workflow packages every supported desktop target on a native GitHub-hosted runner. The matrix contains Windows x64 and arm64, macOS x64 and arm64, and Linux x64 and arm64, named by the fixed target set `mac-arm64`, `mac-x64`, `win-x64`, `win-arm64`, `linux-x64`, and `linux-arm64`. Windows emits an NSIS installer and a ZIP archive; macOS emits a DMG and a ZIP archive; Linux emits an AppImage, DEB, RPM, and `tar.gz` archive. The builder names each file with the product, version, operating system, and architecture so assets remain unambiguous after they are merged into one release. macOS publishes separate architecture-specific artifacts because the packaged application contains native modules that cannot be merged reliably by the universal builder on the hosted ARM runner.

The Desktop workflow is reusable and manual-only. The [unified release workflow](2026-08-15-unified-native-release-assets.md) calls it for a `birdcoder-v<version>` tag and publishes the matrix together with the container assets. Each lane packages one target, stages exactly the files that target declares, and verifies that name set before uploading, so a packaging regression fails on its own lane instead of surfacing as a missing asset during assembly. The release assembler then rejects missing or extra files, combines the x64 and arm64 Windows and macOS updater entries through structured YAML, retains architecture-specific Linux channel files and macOS blockmaps, and writes the aggregate `SHA256SUMS`. Native runners are required because the packaged application contains platform-specific dependencies that cannot be proven by an x64 cross-build: every target refuses a build host that cannot execute its packaged runtime, and Windows packages with the `BCJ` filter because the bundled NSIS decoder cannot read 7-Zip's automatic ARM64-filtered entries.

The [electron-builder configuration](../../../../apps/desktop/electron-builder.config.mjs) is the single recipe for every lane. The product and the executable are both named BirdCoder, each artifact is named `BirdCoder-${version}-${os}-${arch}.${ext}`, and the updater feed is a `github` provider so electron-builder writes the platform channel file the release requires — a publish value of `null` suppresses that file entirely instead of falling back to repository metadata. The macOS DMG takes part in that metadata: `dmg.writeUpdateInfo: false` also drops the DMG's blockmap and its channel-file entry, and the assembler requires each channel file to name exactly its target's updater formats. The application identifier comes from `DSH_DESKTOP_APP_ID` on every lane, signed or not.

Code signing and macOS notarization remain deployment inputs. `--unsigned` is a per-target packaging mode available on all six targets rather than a Windows-only escape hatch: it drops certificate and notarization inputs, propagates to the runtime preparation subprocess so a macOS runtime materializes without a release identity, and writes no COS auto-update release record. An unsigned lane therefore never claims that an artifact is notarized, and the signed Windows and macOS lanes keep their certificate discovery and post-signature verification.

## Alternatives considered

**Cross-building arm64 targets from x64 runners.** Rejected because optional native dependencies and Electron platform binaries can be selected for the host rather than the requested target; a green build would not prove that the delivered application starts on arm64.

**Publishing one universal macOS artifact from the ARM runner.** Rejected because the x64 staging app inherits ARM native modules from the workspace install, and `@electron/universal` rejects the duplicate Mach-O files. Separate x64 and arm64 artifacts preserve the correct native module for each target.

**Keeping one installer target per operating system.** Rejected because a single format does not cover both managed installation and download-and-run workflows, and Linux users commonly need both a self-contained AppImage and a distribution package.

**Adding signing and notarization credentials to this change.** Rejected because certificates, notarization credentials, and the organization's trust policy are deployment secrets rather than repository defaults. The artifact matrix is deterministic and ready to consume those secrets in a later release policy change.

**Separate workflows for every platform.** Rejected because duplicated release and checksum logic would allow the platform lanes to drift; one matrix keeps target coverage and publication rules reviewable in one place.

## Consequences

Each tagged dsh release carries six architecture-labelled target combinations, installable and portable assets for Windows, macOS, and Linux, update metadata, and checksums. Matrix execution takes longer and depends on the availability of native hosted runner labels, but it makes platform-specific failures visible before publication. The published files are unsigned unless release infrastructure supplies signing and notarization configuration, so commercial distribution must add those credentials and verify the resulting trust metadata before treating a build as notarized.
