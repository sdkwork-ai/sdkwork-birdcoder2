# @deepseek-ai/dsh-client-ui-sdkwork-updater

English | [中文](README.zh.md)

Desktop update discovery UI for the Electron shell. The plugin occupies `shell.overlay` with an update banner and `settings.general.item` with the update preferences row. It ships only in the `dsh-desktop-app` bundle; the Web composition does not load it, and both registrations render nothing when the preload has no `desktopBridge.updates` member.

The main process owns discovery, download, installation, and the durable `desktop` settings namespace. This package mirrors the bridge-pushed update state into two slot stores and routes user actions back through the preload. The banner presents an available version, download progress, release notes, installation readiness, and a link to the GitHub Release. The settings row controls quiet checks, the accepted release channel (`follow`, `stable`, or `rc`), automatic download, and a manual check.

`follow` accepts prereleases when the installed version is a prerelease and follows stable releases after a stable installation. The main process checks only packaged applications; source launches expose the disabled state and never contact the release provider. Settings writes use `ctx.settingsScope` and remain live across the tray and updater consumers of the same namespace.

## Model Experience

None, as the plugin renders desktop update state and preferences without adding a session event or changing a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Release-candidate desktop artifacts are unsigned. An operating system may reject automatic installation or require an explicit confirmation; the banner's release-page action and published SHA-256 checksums provide the manual installation path until code signing is configured.
- Update discovery depends on the canonical `latest*.yml` metadata and installer assets remaining together in the matching GitHub Release.
