# Agent Note: OEM brands own their home and application identity

Status: implemented

English | [中文](2026-10-29-oem-brand-home-and-identity.zh.md)

## Problem

Two SDKWork applications built from this repository must install, run, update and uninstall side by side, and a future OEM must add a third without touching the shell. Every shared value breaks that: one `DSH_HOME` lets two brands read each other's sessions, credentials, plugins and workspaces; one `productName` shares userData, the Chromium single-instance lock and the logs directory, so launching one application quits the other; one URL scheme, command name and Windows PATH-ownership key make each brand steal the other's registration; one updater cache lets one brand install the other's update. The shell also could not choose its home from `oem.json`, because that file lives inside the home.

## Decision

`brands/<key>.json` is the single owner of every identity value two installed brands must not share: the home directory name, the Electron product name and executable, the URL scheme, the desktop command and its ownership-record stem, the Windows registry key and mutex stem, the updater cache directory, and the artifact prefix. `apps/desktop/scripts/brand-manifest.mjs` validates it and rejects the upstream identity (`~/.dsh`, `DeepSeek Harness`, `dsh`, `com.deepseek.harness`). Packaging selects it with `DSH_BRAND` (or `DSH_BRAND_CONFIG`), ships it as `resources/brand.json`, copies an optional `brands/<key>.oem.json` beside it as `oem.json`, and derives the electron-builder `productName`, `extraMetadata.productName`, `executableName`, `artifactName`, protocols, appId fallback and updater cache from it.

`apps/desktop/src/brand.ts` reads that manifest at shell start, resolves `~/.<home.dirName>`, and exports it as `DSH_HOME` before any consumer resolves the home — upstream packages keep their `~/.dsh` default because the value arrives through the environment they already read. Precedence is an explicit `DSH_HOME`, then the brand home, then the legacy `~/.dsh` for a brand that sets `home.adoptLegacyDshHome`. A packaged first launch renames the legacy directory, falls back to a directory link when a rename is refused, and otherwise keeps the legacy home for that launch and reports it; a source launch never renames, and a brand without the flag never reads `~/.dsh`.

## Alternatives considered

**Modify `@deepseek-ai/dsh-home-paths` to default to a brand directory.** Rejected: that package is upstream-owned and every consumer reads it, so a merge would revert the change or, worse, resolve a different home in one process. The environment override is the documented seam.

**Put the home name in `oem.json`.** Rejected: `oem.json` is read from the home, so the value would have to be known before the file could be found. The manifest has to live outside `DSH_HOME`.

**Let the installer pass `DSH_HOME` through shortcuts.** Rejected: one missed launcher (tray start, protocol activation, updater relaunch, CLI command) silently starts on the wrong home.

**Copy the legacy home instead of moving it.** Rejected: sessions and attachments are large, so a copy doubles disk use and leaves two homes that drift. A rename is a same-volume move; when it is refused, the link keeps both names valid without touching the data.

**Give every brand the legacy adoption.** Rejected: an OEM brand would import another product's credentials and sessions. Adoption is an explicit manifest flag.

## Consequences

The shipped brand moves to `~/.birdcoder` on the first packaged launch, and `npm dsh` keeps `~/.dsh`; a user who wants them to share a home sets `DSH_HOME`. Display copy still comes from `resolveDesktopLocale` and the OEM profile, so `brand.name` and the manifest's `displayName` can differ — the manifest owns identity and paths, the OEM profile owns endpoints and user-facing brand text.

Icons, installer copy and native window strings remain build-time assets: an OEM build must replace the rasters the way it replaces them today, and `brands/README.md` records that limitation. A new brand also needs an executable of its own `executableName`, which electron-builder derives from the same field.
