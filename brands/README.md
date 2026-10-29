# Brand manifests (OEM)

English | [中文](README.zh.md)

One JSON file per application brand. A brand is the complete identity of one
installed application: the Harness home it owns, the Electron product name, the
URL scheme, the desktop command, the updater cache directory and the artifact
spelling. Two brands built from this repository install, run, update and
uninstall side by side because none of those values is shared.

`birdcoder.json` is the shipped brand. Everything the packaging scripts and the
Electron shell derive by default comes from it.

## Files

| File | Owner | Purpose |
|---|---|---|
| `brands/<key>.json` | this repository | Build-time source of one brand |
| `brands/<key>.oem.json` | deployment | Optional OEM profile shipped as `resources/oem.json` |
| `resources/brand.json` (inside a packaged app) | packaging | Runtime copy of the selected manifest |
| `resources/oem.json` (inside a packaged app) | packaging | Runtime copy of `<key>.oem.json`, when present |

## Selecting a brand

Highest precedence first:

1. `DSH_BRAND_CONFIG=/abs/path/brand.json` — an explicit manifest, for a packaging
   lane that keeps its brand files elsewhere.
2. `DSH_BRAND=<key>` — `brands/<key>.json`.
3. `birdcoder` — the shipped brand.

Packaging uses the same precedence, writes the selected file as
`resources/brand.json`, and copies `<key>.oem.json` beside it as `oem.json` when
it exists. At runtime the shell reads `resources/brand.json`; a source checkout
(`pnpm dev:desktop`) reads `brands/<key>.json` instead.

## Fields

| Field | Meaning | Example |
|---|---|---|
| `key` | Lower-case brand key; names the file and appears in logs | `birdcoder` |
| `displayName` | Product name for surfaces that read the manifest directly | `BirdCoder` |
| `companyName` | Vendor name for packaging metadata | `SDKWork` |
| `home.dirName` | Harness home directory under the user's home; dot-prefixed and lower case so two brands cannot collide on a case-insensitive filesystem | `.birdcoder` |
| `home.adoptLegacyDshHome` | Whether a packaged first launch may take over an existing `~/.dsh` | `true` |
| `desktop.appId` | Reverse-DNS identifier; `DSH_DESKTOP_APP_ID` still wins for release lanes | `com.sdkwork.birdcoder` |
| `desktop.productName` | Electron product name; names userData, the single-instance lock and logs | `BirdCoder` |
| `desktop.executableName` | Installed executable and macOS `MacOS/<name>` | `birdcoder` |
| `desktop.protocol` | Custom URL scheme the shell registers | `birdcoder` |
| `desktop.commandName` | Desktop command, launcher file name and ownership-receipt stem | `birdcoder` |
| `desktop.registryKey` | Windows PATH-ownership key and mutex stem | `BirdCoder` |
| `desktop.updaterCacheDirName` | electron-updater cache directory | `birdcoder-updater` |
| `desktop.artifactPrefix` | Artifact stem before `-<version>-<os>-<arch>` | `BirdCoder` |

`parseBrandManifest` rejects malformed values and the upstream identity
(`~/.dsh`, `DeepSeek Harness`, scheme and command `dsh`, `com.deepseek.harness`).
A typo fails the build instead of silently splitting one application's data
across two homes.

`desktop.protocol` also carries the SDKWork IAM browser-login callback: an OEM
brand that changes it must set `sdkwork.iamRedirectUri` in its OEM profile to
`<scheme>://auth/callback` (see
[the OEM profile](../packages/host/sdkwork-oem/README.md)), because the packaged
shell can only receive schemes the operating system was told about.

## Harness home

The launcher resolves the home before any plugin mounts and exports it as
`DSH_HOME`, which every consumer already reads:

1. An explicit `DSH_HOME` — tests, CI, portable installs.
2. `~/<home.dirName>` — the brand's own home.
3. The legacy `~/.dsh`, only for a brand that sets `home.adoptLegacyDshHome` and
   only in a packaged launch:
   - the first launch renames `~/.dsh` to the brand home (same-volume move, so
     sessions, credentials, profiles and workspaces move with it);
   - when a rename is refused — an older instance may still hold a file — it
     creates a directory link instead;
   - when neither works it keeps using `~/.dsh` for that launch and reports it,
     so the application still starts and no data is lost.

A brand without `adoptLegacyDshHome` never reads `~/.dsh`: importing another
product's credentials and sessions is worse than starting empty. A source launch
never renames anything; it uses the brand home when it exists and otherwise
keeps `~/.dsh`.

A shipped `resources/oem.json` becomes the default `DSH_OEM_CONFIG` only when the
home carries no `oem.json` of its own, so a deployment ships its endpoints
read-only and a user can still override them from `~/.<brand>/oem.json`.

## Adding a brand

1. Copy `brands/birdcoder.json` to `brands/<key>.json` and change `key`,
   `displayName`, `companyName`, `home.dirName` and every `desktop` value.
   Leave `home.adoptLegacyDshHome` false unless the new brand replaces an
   existing `~/.dsh` installation.
2. Replace the build-time rasters for that brand: `build/icon.{ico,icns,png}`,
   `resources/icon{,-windows,-macos}.png`, the installer brand images
   (`pnpm --dir apps/desktop run generate-icons` and
   `generate-installer-brand` regenerate the shipped set), and the welcome
   lockup. The runtime never swaps images.
3. Build with `DSH_BRAND=<key>` (and the lane's `DSH_DESKTOP_APP_ID`,
   `DSH_DESKTOP_UNSIGNED`, signing variables) using the `package:*` scripts.
4. Verify: `pnpm exec vitest run apps/desktop/tests/brand-manifest.spec.ts
   apps/desktop/tests/brand-home.spec.ts apps/desktop/tests/desktop-application-identity.spec.ts`,
   then install both brands and confirm two homes (`~/.birdcoder`, `~/.<key>`),
   two userData directories, two URL schemes and two commands.

## Not brand-scoped yet

- Installer copy and native window strings come from `apps/desktop/scripts/locale*`
  and the NSIS include; they carry the shipped brand until an OEM build replaces
  them the way it replaces the rasters.
- Icon and artifact artwork is generated from the canonical BirdCoder raster.
- `desktop.executableName` names the installed binary; an OEM build must ship a
  binary of that name, which electron-builder derives from the same field.
