# Agent Note: Adopt the SDKWork plugin-market fork and build its host half here

Status: implemented

English | [中文](2026-11-19-forked-plugin-market.zh.md)

Partially supersedes [The plugin market ships by default](../feature/2026-11-02-plugin-market-ships-by-default.md): the bundle-row mount, the `market` client contract, the host-managed `selfManaged: false` face, and the reason the market ships inside the Web closure all stand. What changes is where the package comes from and who builds it.

## Problem

The plugin market shipped as the registry package `dshmarket@^1.73.8`, a third-party npm tarball. That answers "the catalog exists", not "this fork owns the catalog's behavior". Every change the fork wants — a different default, an SDKWork-only install rule, a UI fix that cannot wait for an upstream release — is an upstream contribution followed by an upstream release, then a version bump here. It also splits one product surface across two release trains: the market can move itself through its own update channel while the app pins a different version.

The package now has an SDKWork-owned upstream: `sdkwork-ai/sdkwork-dsh-market`, a fork of `dsh-market/dsh-market`. Consuming it as a registry release no longer fits, because that repository publishes to npm through the upstream project's trusted-publishing registration and this fork is not that publisher.

## Decision

### The repository is fork-owned

`plugins/dsh-market` is a Git submodule of `sdkwork-ai/sdkwork-dsh-market` — the same shape as the other fork-owned plugins. [AGENTS.md](../../../../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract) and `plugins/README.md` list the exception: source and product changes for the market land in that repository, and this checkout pins them by gitlink. The npm package name (`dshmarket`) and the loader row id (`dsh-market`) stay unchanged, so the bundle composition, the package's own `dsh.bundle.patch`, and every reference in `ui-sdkwork-markets` keep working.

### The bundle links the fork instead of fetching it

`packages/bundle/web-app/package.json` declares `"dshmarket": "workspace:*"`; `plugins/*` is already a workspace glob, so `pnpm install` links the submodule and installs the plugin's own runtime dependencies (`js-yaml`, `undici`) beside it. The desktop layer patches over the Web bundle and inherits both the dependency and the row, as before.

### The fork commits its browser half; this repository builds its host half

The upstream build splits the plugin in two: `client/client.js` is a committed artifact, while `lib/` (the host half `tsc` emits from `src/`) is gitignored and produced only by `prepack`. A gitlink therefore ships the browser half and nothing the loader can import.

`scripts/build-dsh-market.mjs` fills that gap the way the assistant and better-sidebar builds already do: `postinstall` runs it with `--optional`, `pnpm run build:artifacts` runs it as its own gate, and a content-addressed stamp in `.dsh-build/dsh-market-build.json` makes a re-run a no-op while the inputs, the outputs, and the build mode match. It compiles `lib/` with the plugin's own `tsconfig.json` through the TypeScript version the fork pins (the native compiler), and it removes `lib/` first so a deleted source cannot leave a stale module the loader would still import.

The compile has two stamped modes, because the framework declarations it type-checks against are themselves build output. **Checked** is the normal path: the Host compiler has emitted `vendor/cordis` and `vendor/schemastery` declarations, so the plugin compiles against the sources this build runs; `pnpm run build:artifacts` schedules the gate after `host-src` to guarantee that. **Emit-only** covers the fresh checkout, where `postinstall` runs before any Host compiler pass and those packages carry no `lib/types`: the build falls back to `tsc --noCheck`, which emits `lib/` so the first boot imports. The stamp records the mode, so the next artifacts build replaces an emit-only `lib/` with a checked one instead of treating it as current.

The browser half is deliberately not rebuilt here. A client change is made, built, and committed in the fork; the gitlink bump carries it. `pnpm pack` (what the Desktop packaging runs per `plugins/*` manifest) triggers the fork's own `prepack`, so a packed tarball still carries a `lib/` that matches the sources it was packed from.

### The plugin's framework edges resolve to this checkout

Scoped `dshmarket>` overrides in `pnpm-workspace.yaml` point its `@deepseek-ai/*` edges at the sources this build runs: `cordis` and `schemastery` link to `vendor/`, the rest resolve to the workspace's `0.2.2-rc.5` packages. `schemastery` is the host half's only framework import (the market's Config schema), so a registry copy would be a second schema builder beside the host's.

Two upstream devDependencies name packages this checkout no longer carries — `@deepseek-ai/dsh-invariants` and `@deepseek-ai/dsh-client-ui-settings-plugins`. Nothing in the plugin's `src/` imports either; only its own test fixtures spell them. The same override block removes them, which keeps the published `0.1.0` line — a second, complete harness closure with its test kits — out of the lockfile. The plugin's own test suite is not run here.

`dshmarket@1.73.8` also leaves `minimumReleaseAgeExclude`: the pin is no longer a registry release, so the release-age exemption no longer applies to anything.

## Alternatives considered

**Stay on the Registry release and contribute upstream.** This keeps the npm pin and its supply-chain review, but leaves behavior the fork must own on the upstream release cadence, and it cannot express an SDKWork-only rule at all.

**Consume the fork as a Git dependency (`github:sdkwork-ai/sdkwork-dsh-market#<sha>`).** pnpm would fetch the fork at install time and run its `prepare`, so every install needs network access and a build-script approval for a build this checkout already performs; the artifact would also be outside the workspace's dependency and override graph.

**Commit `lib/` into the fork.** This is how the other fork-owned plugins ship, and it would remove the build step here. It was rejected for this plugin because its upstream does not commit `lib/` and gates the committed browser half against a reproducible rebuild: committing half the artifacts would make every upstream merge fight `.gitignore` and the CI diff gate, and the built output would then be invisible to this repository's content-addressed freshness check.

**Keep it out of the workspace and link it with `link:`.** The plugin's runtime dependencies (`js-yaml`, `undici`) would resolve from nowhere, and its framework peers would fall back to published copies instead of this checkout's sources.

## Consequences

- Market source and product changes land in `sdkwork-ai/sdkwork-dsh-market`; shipping one here is a gitlink bump plus `pnpm install` and the acceptance spec.
- A fresh checkout gets a loadable `lib/` from `pnpm install` alone (emit-only), and the first `pnpm run build:artifacts` redoes it checked. Lanes that never initialize the submodule skip the build quietly; a lane that packages the plugin hits the artifact gate and the fork's `prepack` instead of shipping an import that cannot load.
- Where the Host compiler has emitted the vendored declarations, the host half type-checks against this checkout's `cordis` and `schemastery` sources; an emit-only build trades that check for a loadable artifact, and the artifacts path restores it.
- The lockfile grows by the plugin's own runtime closure (`js-yaml`, `undici`) and its dev toolchain, with no parallel `@deepseek-ai` harness closure.
- The fork's browser half is not reproducible from this checkout alone: a client change needs the fork's own build before the pin bump. The acceptance spec still fails if the committed client stops publishing the `market` control at contract version 1.

## Verification

- `packages/bundle/web-app/tests/built-in-plugin-market.spec.ts` passes: the composed row, the linked manifest's `dsh.client` web half and `dsh.bundle.patch`, both entry artifacts at the paths the row resolves, and the `market` control at contract version 1 with `render`.
- `pnpm run build:dsh-market` compiles `lib/` from the fork's `src/`, writes the stamp, and is a no-op on a second run; `git -C plugins/dsh-market status --porcelain` stays empty after `pnpm install`, so the committed browser half matches its own source build.
- With `vendor/cordis/lib` and `vendor/schemastery/lib` moved away (a fresh checkout's state), the build still emits `lib/` and stamps `emit-only`; restoring them makes the next run rebuild checked purely because the stamped mode differs.
- Loading `dshmarket` from `packages/bundle/web-app` resolves the linked package, and its `@deepseek-ai/schemastery` / `@deepseek-ai/cordis` edges resolve to `vendor/`, proving the overrides reach runtime resolution.
- The real web roster (`packages/test-support/client-runtime`, composed from `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`) carries `dshmarket` among its browser rows with its three `dsh.client.inject` edges, and `assembly-bundle-roster.client.spec.ts` now fails if the row leaves the roster.
- Real composition: a source `dsh web` boot with a scratch `$DSH_HOME` (no market install beyond the composed Web bundle) answers `/dsh-market/status` with `{"version":"1.73.22", …, "selfManaged":false}` from the built host half, and the shell document preloads `dshmarket/client.js`, so the committed browser half is in the page's load graph.
- `pnpm --dir plugins/dsh-market pack` succeeds and its tarball carries `package/lib/index.js`, `package/client/client.js` and the locale files, which is the artifact set the Desktop packaging loop consumes.
