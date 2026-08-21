# Agent Note: Desktop updates from GitHub Releases

Status: implemented

English | [中文](2026-08-15-desktop-auto-update.zh.md)

## Problem

The packaged desktop shell needs to discover a newer release, select an installer for its operating system and architecture, and let the user control download and restart. Source launches have no installed application to replace, and unsigned macOS builds cannot hand an update to the operating system reliably. The repository's `dsh-v<version>` tags also carry a product prefix that electron-updater does not accept as SemVer when it reads the GitHub Atom feed.

## Decision

The Electron main process owns update discovery through `electron-updater` and the GitHub Releases provider declared in `apps/desktop/electron-builder.yml`. `apps/desktop/src/update.ts` wraps the provider behind an injectable driver and exposes explicit `disabled`, `idle`, `checking`, `available`, `downloading`, `downloaded`, and `installing` states. Source launches stay disabled. The controller disables the provider's automatic download and install-on-quit behavior, admits checks only from `idle`, moves to `downloading` before awaiting the provider, and contains check, download, and installer-handoff failures in a retryable state.

The `desktop` settings namespace stores automatic checking, the release channel, and automatic download beside the close-to-tray preference. A packaged launch checks after 15 seconds and every six hours while automatic checking is enabled. `follow` mirrors the installed version class, `stable` rejects prereleases, and `rc` accepts them. Automatic download never implies automatic restart.

The repository carries a pnpm patch for electron-updater's GitHub provider. It removes the controlled `dsh-v` prefix only when validating and comparing feed versions or deriving a channel; it retains the original tag when constructing release and asset URLs. Prerelease discovery preserves electron-updater's channel selection. Stable-only discovery scans the Atom feed and selects the highest non-prerelease SemVer across `dsh-v` and legacy `v` tags without requesting GitHub's `/releases/latest` endpoint.

`DesktopBridge.updates`, its IPC channels, and the preload carry state and actions between the main process and `@deepseek-ai/dsh-client-ui-sdkwork-updater`. IPC handlers are registered before the renderer URL loads, and the renderer contains a failed initial state query. The client plugin contributes a banner, one General-settings row, and the tray's optional manual check action. Downloading and downloaded banners cannot be dismissed, and action guards prevent repeated checks, downloads, and installs.

Current macOS artifacts are unsigned, so they advertise `canInstall: false`: discovery and release notes remain available, while the UI directs users to the GitHub Release page for manual installation. Windows and Linux builds expose download and installer handoff. The Web composition has no updater package or desktop bridge.

The [unified native release workflow](../process/2026-08-15-unified-native-release-assets.md) publishes the platform installers, canonical electron-updater metadata, architecture-specific macOS blockmaps, and aggregate checksums in the same GitHub Release. Missing or inconsistent metadata prevents publication.

## Alternatives considered

**Fetch GitHub releases in the renderer.** This would duplicate release selection, move network and installer authority into the sandboxed UI, and bypass electron-updater's platform verification and handoff.

**Use Electron's built-in Squirrel updater.** The desktop distribution uses NSIS and Linux targets, which require electron-updater's provider and packaging support.

**Make the Release page the only update mechanism.** The page remains the manual fallback, but it cannot provide quiet discovery, release-channel selection, download progress, or a controlled restart after an installer is ready.

**Install every discovered update automatically.** An agent session may still be active, so download and restart remain separate user choices. The updater never installs during an unrelated application quit.

**Rename product tags to satisfy electron-updater.** The `dsh-v` namespace distinguishes product releases from package-family tags. Narrow feed normalization preserves that release taxonomy and the original GitHub URLs.

## Consequences

Packaged users receive update offers and can choose stable-only or prerelease channels without exposing repository credentials to the renderer. Release candidates on macOS require manual installation until the release workflow supplies signing and notarization; other supported desktop targets can download and hand off the selected installer. Each running packaged app makes infrequent unauthenticated GitHub requests, and every release must retain the metadata and checksums the installed clients consume.

## Verification

Updater tests cover state transitions, scheduling, live settings, duplicate-action guards, manual-only builds, provider and installer failures, IPC ordering, tray failure containment, and renderer presentation. Provider-level tests parse a representative GitHub Atom feed, verify that release-candidate discovery retains original asset URLs, and prove that stable-only discovery selects the highest stable tag without using `/releases/latest`. The packaged-boot smoke loads the shipped preload bridge and client bundle. The snapshot harness has no Electron preload lane, so the desktop-only banner has no assembled browser snapshot.
