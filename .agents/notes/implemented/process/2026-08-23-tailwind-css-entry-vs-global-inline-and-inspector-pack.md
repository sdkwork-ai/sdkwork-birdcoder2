# Agent Note: Tailwind CSS entry must beat the preset global-inline plugin; release packaging gains --inspect

Status: implemented

English | [中文](2026-08-23-tailwind-css-entry-vs-global-inline-and-inspector-pack.zh.md)

## Problem

The packaged renderer requested `app://dsh/tailwindcss/theme.css` and got a 404, blanking the UI at boot. `tokenPlan.css` (a Tailwind v4 entry inside `ui-sdkwork-token-plan`) keeps `@import "tailwindcss/theme.css" layer(theme)` and `@import "tailwindcss/utilities.css" layer(utilities)`; the package's own Tailwind compile plugin is supposed to inline them. In the Client tsdown pass the preset's `dsh-css-global-inline` plugin runs before the package plugin (preset plugins are spread first), claims `./tokenPlan.css` as an ordinary global stylesheet, and emits it verbatim — bare `@import`s and `@source` rules included — so the app serves them as missing routes. Sibling-owned Tailwind entries were unaffected because `isInImporterPackageSources` declines stylesheets outside the declaring package.

`release:gitdependencylocal` also copied only files back from the build tree: the `win-unpacked` directory (which the boot probe runs against) was never refreshed, so a stale tree could be probed instead of the new build.

## Decision

- `ui-sdkwork-token-plan` moves its browser-builtins, qrcode, Tailwind, and plain-CSS plugins ahead of `config.plugins` so `tokenPlan.css` reaches the Tailwind compiler first. `physicalCssPath` matches the file name (`endsWith('tokenPlan.css')`) instead of only absolute `/tokenPlan.css` spellings, because the page imports it as `./tokenPlan.css`.
- `release:gitdependencylocal` accepts `--inspect [port]` (default 9229): the port flows to the desktop tsdown config via `DSH_PACKED_INSPECT`, which `apps/desktop/tsdown.config.ts` turns into a define — a literal port in packaged builds, `''` (and tree-shaken relaunch code) by default. `main.ts` relaunches once with `--inspect=<port>` when a baked port exists and no `--inspect` argument is already present, because the V8 inspector only honors startup arguments (`app.commandLine.appendSwitch` was verified ineffective for the main process).
- The artifact copy wipes `apps/desktop/release-build` first and recurses into directories, so `win-unpacked` is always the fresh build.

## Consequences

Other packages' Tailwind entries live in sibling checkouts and never passed through `dsh-css-global-inline`; only package-owned entries need the ordering. A packaged build without `--inspect` contains no inspector code at all (verified by bundle inspection). Debugging a packaged build connects to `127.0.0.1:9229` after the automatic one-time relaunch.

## Testing

`packaged-boot-probe` passes for both relative-path and git-dependency packages; the packaged exe with `--inspect` listens on 9229 and answers `GET /json/list` with a `node.js instance`.
