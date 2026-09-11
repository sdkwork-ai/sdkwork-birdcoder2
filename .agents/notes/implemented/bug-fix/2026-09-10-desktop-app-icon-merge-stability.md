# Agent Note: The desktop shell keeps the BirdCoder app icon

Status: implemented

English | [中文](2026-09-10-desktop-app-icon-merge-stability.zh.md)

## Problem

The 2026-09-10 upstream alignment (`chore 54561513cf`) adopted upstream's window creation for `apps/desktop/src/main.ts`. Upstream never names an application icon, while the previous fork shell passed the shipped `build/icon.png` to every `BrowserWindow`. The same change deleted `apps/desktop/scripts/generate-icons.mjs`, its `generate-icons` package script, and the `assets/birdcoder2-appicon.png` raster that script resized, and dropped the window raster from electron-builder's `files` list.

The committed rasters survived, so packaged installers kept the bird through electron-builder's default `build/icon.*` paths, but three gaps remained. The unpackaged shell (`pnpm dev:desktop`, `start:desktop`) and any packaged window that needs an explicit icon drew the default Electron icon. No repository content could reproduce the rasters: their source raster was gone and the generator that assembled the ICO and ICNS containers with it. Nothing failed when a merge deleted a raster or unwired an icon, which is how this regression reached master. AGENTS.md "BirdCoder brand assets" asserts that the desktop shell derives `apps/desktop/build/icon.{ico,icns,png}` from `apps/web/public/favicon.png`, and that assertion had no implementation behind it.

## Decision

The fork owns one window-icon file, `apps/desktop/src/app-icon.ts`. It resolves `build/icon.png` under `app.getAppPath()` and returns it only for platforms whose windows draw their own icon; macOS takes the icon from the signed bundle, so it returns undefined there. `createWindow()` passes the result to every `BrowserWindow`, covering the main window and the plugin-management window in both development and packed applications. The packaging configuration adds the same raster to `files`, which the asar application reads back through `app.getAppPath()`.

`apps/desktop/scripts/generate-icons.mjs` returns as the single derivation step, and now reads the canonical raster `apps/web/public/favicon.png` directly instead of the deleted `assets/` copy. It trims the transparent margin with sharp, renders square RGBA rasters, and assembles the Windows ICO (16 through 256) and macOS ICNS (16 through 1024) containers in the script, so regeneration needs no platform icon tooling. `pnpm --dir apps/desktop run generate-icons` rewrites the three shipped files; the committed rasters are that command's output. sharp joins `apps/desktop` devDependencies, matching the workspace build-script allowance that already documents sharp for icon rasterization.

Packaging names every icon instead of inheriting electron-builder defaults: `directories.buildResources` is `build`, and `mac.icon`, `win.icon`, `linux.icon`, and the three NSIS installer icons point at the shipped rasters through `brandIcon()`, which throws before packaging when a file is missing. `apps/desktop/tests/app-icon.spec.ts` asserts the raster formats (512×512 PNG, an ICO carrying a 16 and a 256 entry, an ICNS carrying 512 and 1024 chunks), the window-icon resolution per platform, and the packaging wiring.

## Verification

`pnpm exec vitest run apps/desktop/tests/app-icon.spec.ts` covers raster structure, window-icon resolution, and packaging wiring; `apps/desktop/tests/macos-signature.spec.ts` still exercises the same configuration factory. `npx tsc -b apps/desktop` and `npx tsc -b tsconfig.host.json` (which includes `apps/desktop/tests`) pass, as does oxlint over the changed files. The regenerated rasters were inspected as images, and re-running `generate-icons` reproduced them byte for byte. One packaged-application detail was checked directly: an Electron process launched against an asar archive holding `build/icon.png` loaded it through `app.getAppPath()` as a 512×512 image, and `build/icon.png` survives electron-builder's `files` filtering that excludes the rest of the build resources directory. Electron-builder packaging itself was not run here: it requires the prepared runtime, package set, and seed for a release target. The AGENTS.md brand checklist gains the same three checks, so the next upstream merge re-verifies the wiring before pushing.

## Alternatives considered

**Rely on electron-builder defaults and the packaged executable icon.** This is the state the alignment merge left, and it needs no code: the installed application carries the bird through the executable. It leaves the unpackaged shell with the default Electron icon, and no check fails when a merge deletes a raster, so the regression recurs silently.

**Commit the rasters without restoring the generator.** This keeps the tree smaller and avoids a sharp devDependency, but leaves the three shipped files unreproducible from repository content and unverified by any test, which is the condition that let the merge drop them unnoticed.

**Restore `assets/birdcoder2-appicon.png` as the generator's source.** Pointing at the deleted fork copy would restore the old pipeline unchanged, but duplicates the canonical raster that AGENTS.md fixes at `apps/web/public/favicon.png` and reintroduces a second file to keep in sync.

**Ship the window raster through `extraResources` and resolve it from `process.resourcesPath`.** This separates build resources from application code, but the shell would then resolve two different paths in development and packed runs. Inclusion in `files` keeps one path for both, which the existing packaged-path check in the spec pins.

## Consequences

The window icon now has three independent carriers: the shell's window option, the asar-contained raster, and the electron-builder icon fields. A merge that reverts any one of them fails the `app-icon` spec or the shared verification command in AGENTS.md, instead of shipping an unbranded window. The cost is one new source file, one restored script, one devDependency, and roughly 250 KB of asar content for the window raster.

Regenerating icons is now tied to the canonical raster: changing the product mark means replacing `apps/web/public/favicon.png`, re-running `generate-icons`, and committing the regenerated `build/icon.{png,ico,icns}`. The ICO and ICNS containers are assembled in-repo, so their correctness is covered by the spec's format assertions rather than by platform tooling.

The desktop tray, whose icon came from the same raster, is not restored here; the alignment merge removed that fork feature deliberately as part of adopting upstream's architecture ([desktop tray background mode](../feature/2026-08-15-desktop-tray-background-mode.md) records its design if it returns). Packaging and update behavior remain as described in [the Electron desktop packaging note](../architecture/2026-08-25-electron-desktop-packaging-and-updates.md), and the merge-time re-verification belongs to [the upstream sync procedure](../process/2026-08-21-upstream-sync-procedure.md).
