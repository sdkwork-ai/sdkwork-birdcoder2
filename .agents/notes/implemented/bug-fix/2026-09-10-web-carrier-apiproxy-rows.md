# Agent Note: The web carrier mounts the apiProxy domain too

Status: implemented

English | [中文](2026-09-10-web-carrier-apiproxy-rows.zh.md)

## Problem

The 2026-09-10 upstream merge left the desktop carrier without the fork's `/api` fallback (fixed in [the desktop-host note](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.md)), and a follow-up audit found the same loss one layer wider: the **web composition never mounted the two rows at all**. `dsh web` composes `dsh-base` + `dsh-web-app`, and the `web-app` bundle's insert list carried neither `sdkwork-api-gateway` nor `apiproxy` — only the desktop overlay did. A controlled boot of that exact composition answered `POST /api/host.describe` 404, `POST /api/workspace.list` 404, and `POST /api/host.openPath` 404; adding the two rows back flipped all of them to 200.

This is not a corner: the client-runtime's `WorkspaceRuntime` (the `workspaces` service the sidebar consumes) speaks the apiProxy wire dialect on every carrier — `workspace.list`, `host.describe`, `host.openPath` are apiProxy methods. On the web carrier the entire renderer data plane therefore 404'd: empty workspace list, dead open-folder and open-terminal gestures, no `host.describe`. The gateway README even recorded the absence as intentional ("the web composition mounts neither"), which was the pre-merge web composition's shape when its renderer still spoke the BFF Typert dialect — a contract that no longer exists.

## Decision

`packages/bundle/web-app/cordis.patch.yml` inserts both rows (`sdkwork-api-gateway`, `apiproxy` — no `nativeOpen` config, so opener availability follows platform detection and a headless web host reports `canOpenPath: false`), and the bundle manifest declares both as `workspace:^` dependencies for the resolver closure. The desktop overlay keeps its `nativeOpen: true` fact as a config-only override of the row the bundle now mounts — re-inserting the same ids in the overlay would mount the plugins twice, because the boot composes each layer's `insert` as independent rows.

`apps/desktop/tests/desktop-host-composition.spec.ts` now pins the split: the bundle mounts both rows and declares both dependencies; the overlay's only apiproxy touch is the `nativeOpen` override; the overlay's insert list stays limited to the native directory picker. The test parses both patch files through `loadOverlayPatches` (the boot's own loader — the bundle patch carries `!!js` expressions a plain YAML parse rejects), which added `@deepseek-ai/dsh-app-boot` as an `apps/desktop` devDependency.

## Verification

Controlled boots over the installed desktop project's composition, driven through `runDesktopHost` (the Electron child's own entry): without the two rows `host.describe`/`workspace.list`/`host.openPath` all answer 404; with them (rows now owned by the bundle, `nativeOpen` override from the overlay) `host.describe` returns 200 with `canOpenPath: true`, `workspace.list` returns 200, and `host.openPath` returns `{ opened: true }` with a real Explorer window. `pnpm vitest run desktop-host-composition` passes 8 cases; `pnpm run verify-cordis-config` now resolves the `sdkwork-api-gateway/desktop` subpath after adding its `tsconfig.base.json` paths row, leaving only the pre-existing `apps/cli/tests/profiles/acp/cordis.yml` pointer-fixture complaint.

## Alternatives considered

**Leave the rows in the desktop overlay only (the pre-merge shape).** Rejected: `dsh web` composes `dsh-base` + `dsh-web-app` directly and never loads the desktop overlay, so the web carrier's renderer data plane keeps answering 404 — the exact regression this note fixes.

**Insert the rows in both the bundle and the desktop overlay.** Rejected: the boot composes each layer's `insert` as independent rows, so the same ids would mount the plugins twice; the overlay instead keeps a config-only `nativeOpen: true` override of the row the bundle mounts.

## Consequences

Both carriers now serve the same renderer data plane from the same bundle row, so an upstream merge that drops the rows fails the composition gate on both surfaces at once. The desktop/web split for opener policy is one config value, documented where it is set. The audit also recorded, without acting on, `packages/client/ui-sdkwork-mobile-simulator` shipping unmounted (its slot occupants render unconditionally, so a bare row would float a device frame over the shell); its README now states that.
