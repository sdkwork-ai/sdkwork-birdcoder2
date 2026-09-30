# Agent Note: The desktop shell owns its Electron application identity

Status: implemented

English | [中文](2026-09-30-desktop-application-identity-ownership.zh.md)

## Problem

Electron names a packaged application after the `productName` of the manifest inside `app.asar`, falling back to the scoped package `name` when that field is absent. `apps/desktop/package.json` carried `"name": "@deepseek-ai/dsh-desktop"` and no `productName`, and electron-builder's own `productName` never reaches that manifest — it merges only `extraMetadata`. This application and an installed upstream DeepSeek Harness desktop build therefore both resolved `app.name = '@deepseek-ai/dsh-desktop'` and shared `%APPDATA%\@deepseek-ai\dsh-desktop`, which is what Electron derives every one of these from:

- the Chromium single-instance lock, so launching either application quit the other as a duplicate launch;
- `logs`, `keybindings.json` and the `background-close-confirmed` marker;
- the Chromium profile, cookies and caches;
- the updater cache `%LOCALAPPDATA%\@deepseek-aidsh-desktop-updater`, where the `installer.exe` one application downloaded is the file the other runs.

Windows uninstallation amplified it: `installer/uninstall.nsh` removed `%APPDATA%\${APP_PACKAGE_NAME}`, the shared directory, so uninstalling either application deleted the other's profile. The same merge left upstream's identifiers on three more surfaces: the `dsh://` custom protocol, the desktop CLI command `dsh` (launcher scripts, the macOS `/usr/local/bin/dsh` link, the Windows PATH entry, its registry owner key and its mutex), and the macOS bundle path `DeepSeek Harness.app`, which the fork's packaging lanes looked for while packaging produced `birdcoder.app`.

## Decision

The packaged shell owns every OS resource Electron derives from its application identity. `apps/desktop/scripts/desktop-application-identity.mjs` holds the fork's value for each, and `apps/desktop/package.json` declares the one Electron reads:

| surface | fork value |
| --- | --- |
| `app.name`, userData, `logs`, `sessionData`, single-instance lock | `BirdCoder`, from `productName` in the application manifest |
| updater cache | `birdcoder-updater` |
| custom URL scheme | `birdcoder://open` |
| desktop command | `birdcoder`, `birdcoder.cmd` |
| command ownership | `HKCU\Software\BirdCoder\Command`, `Global\BirdCoder.Command.<sid>`, `.birdcoder-command.json` |
| uninstall data | `%APPDATA%\${PRODUCT_NAME}` |

Packaging refuses to ship the collision rather than reporting it later: the builder configuration stops when the manifest lost `productName`, and its `afterPack` hook reads the manifest back out of the built `app.asar` and refuses any lane whose installer identity and manifest identity disagree. A lane that renames the product for isolation — the Windows installer checks and the installed-update qualification run — must therefore carry the name in `extraMetadata.productName` as well as `productName`, which is what those two lanes now do. `apps/desktop/tests/desktop-application-identity.spec.ts` pins the manifest field, the builder protocols, the shell's scheme and `open-url` handler, the development bundle identifier, the launcher names, the command ownership records and the uninstall targets.

Two boundaries stay where they were. The Harness home (`~/.dsh`, the `desktop` profile, sessions, credentials, settings) remains shared with the npm `dsh` CLI: it is the data both agree on, not a process-scoped resource, and moving it would strand every existing user. Windows uninstallation removes this application's `%APPDATA%\BirdCoder` and its updater cache and deliberately leaves `%APPDATA%\@deepseek-ai\dsh-desktop` in place — that directory is another installed application's userData, and residue from pre-split builds is the price of never deleting data this application does not own ([uninstall decision](2026-09-08-desktop-uninstall-preserve-dsh-home.md), updated).

## Alternatives considered

**Keep `app.name` stable and pin `app.setPath('userData')` in the shell.** It leaves the protocol handler, the updater cache name and the CLI command name shared, and it makes the userData path a runtime detail that `app.getPath('logs')`, the single-instance lock and Chromium still resolve through a name no configuration owns.

**Rename the scoped package to a fork-specific name.** `@deepseek-ai/dsh-desktop` is the fork's own package identity in the workspace graph, the merge surface with upstream, and the name every packaging script and the bundled runtime resolve; changing it to influence a directory Electron picks trades a real identifier for a derived one.

**Write `extraMetadata.productName` instead of a manifest field.** The unpackaged run, and every tool that reads the manifest, would then see the scoped name; the manifest field keeps Electron, the builder and the checked-in source agreeing on one value.

**Rename the desktop command but leave the `dsh://` scheme.** A shared scheme still lets each application take the handler from the other at every launch.

**Delete `%APPDATA%\@deepseek-ai\dsh-desktop` when the fork is the only installation.** Ownership cannot be established from the directory's contents, and the destructive outcome of being wrong is another application's profile.

## Consequences

Two applications can now be installed, run, updated and uninstalled side by side. Each owns its userData, its single-instance lock, its logs, its UI preferences, its protocol registration, its command on `PATH` and its updater cache; launching either one no longer affects the other, and neither uninstaller deletes the other's data.

The Windows uninstaller leaves `%APPDATA%\@deepseek-ai\dsh-desktop` behind, including the logs and UI preferences of pre-split fork builds. Users upgrade from those builds with a fresh `%APPDATA%\BirdCoder`: the Harness home keeps their sessions, credentials and plugins, and the shortcut, the tray and the taskbar identity are unchanged. The desktop command is renamed from `dsh` to `birdcoder` on both platforms, so an existing registration must be reinstalled from **Manage birdcoder Command…**; the previous `dsh.cmd` pointed at an executable this fork never shipped.

Every surface above is a merge-stable contract: [AGENTS.md](../../../../AGENTS.md) records the values, the verification greps, and the reason an upstream merge that drops `productName` fails packaging instead of silently restoring the collision.
