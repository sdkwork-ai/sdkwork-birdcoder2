# Agent Note: The desktop host keeps the fork `/api` fallback, and Explorer reveal rides one token

Status: implemented

English | [中文](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.zh.md)

## Problem

Two desktop gestures died in the 2026-09-10 upstream alignment (`chore 54561513cf`), which adopted upstream's `apps/desktop` and its new `apps/desktop-host` in place of the fork's own host.

The workspace row menu's "打开文件夹" reported `POST dsh-app://app/api/host.openPath 404 (Not Found)`. Before the alignment, `apps/desktop/src/host.ts` mounted the fork's gateway programmatically — `DESKTOP_APIPROXY_PATCH = { insert: [{ id: 'api-gateway', name: '@deepseek-ai/dsh-host-apiproxy' }] }` beside the `@deepseek-ai/dsh-sdkwork-desktop-app` overlay bundle, whose patch carried the `sdkwork-api-gateway` row. The merged host composes the `dsh-base` + `dsh-web-app` profile plus one launcher overlay, `apps/desktop-host/config/desktop.cordis.patch.yml`, and that file — still byte-identical to upstream — carries neither row. `apps/desktop-host/package.json` kept the `sdkwork-api-gateway` dependency, so nothing failed: the renderer's same-origin `POST /api/host.openPath` reached Connection, whose `/api` dispatcher falls back only through `ctx.sdkworkApiFallback`, and with no such service the request ended in Connection's own `not found` branch. The same 404 covered `host.openTerminal`, `host.describe` behind the workspace header, and the rest of the apiproxy roster. This overlay is now the only place the fallback can be mounted at all: no bundle patch in the repository mounts `@deepseek-ai/dsh-host-apiproxy`, because the fork's desktop host was the sole mount point and the merged runtime loads this file.

The delivered-file card's "在文件资源管理器中显示" opened nothing. The alignment also brought upstream's new `revealNativePath`, whose Windows branch ran `run('explorer.exe', ['/select,', target])` — two `execFile` arguments, so the command line carried a space after the comma. Explorer's `/select,` switch requires the switch and its target to be one command-line token ([`showinfilemanager`](https://github.com/damonlynch/showinfilemanager) states it as "No space between comma and URI"); split across two tokens, Explorer ignores the target and opens its default folder, which a user reads as a click that does nothing. The target shape upstream chose — a percent-escaped `file://` URI — is correct and is what keeps spaces and commas out of the command line entirely, so only the split had to go.

## Decision

`apps/desktop-host/config/desktop.cordis.patch.yml` inserts both halves of the fallback as fork-owned rows: `sdkwork-api-gateway` (`@deepseek-ai/dsh-sdkwork-api-gateway`), which provides `ctx.sdkworkApiFallback`, and `apiproxy` (`@deepseek-ai/dsh-host-apiproxy`, `config: { nativeOpen: true }`), which provides `ctx.apiProxy` that the gateway answers 404 for while it is absent. `nativeOpen: true` states the fact a desktop shell already embodies: this Host hands paths to the OS opener instead of asking a display server. `apps/desktop-host/package.json` declares both as `workspace:^` dependencies, so the packaged closure ships them.

`revealNativePath` passes one argument, `` `/select,${target}` ``. The comment on the branch records why the comma and the URI cannot be separated by a space.

The fork deliberately does not restore the local rows upstream's shell replaced. The `app://` carrier lives in the main process's protocol handler, the window is natively framed, the tray is already recorded as deliberately dropped, and update prompts are native dialogs — so re-adding `sdkwork-desktop-carrier`, `window-controls`, or `update-banner` would double each of them up. The overlay therefore inserts only `directory-picker-native`, `ui-directory-picker-native`, and the fallback pair.

## Verification

`apps/desktop/tests/desktop-host-composition.spec.ts` is the new guard. It pins the overlay's insert list, both `workspace:^` dependencies, and that each mounted name resolves to the workspace package that publishes it; it also pins the dispatcher's order — Connection's routes win, the gateway is read lazily per request, and only a 404 triggers the fallback.

`pnpm exec vitest run packages/util/native-command/tests/path-opener.spec.ts packages/api/session-controller/tests/session-open-workspace-path.host.spec.ts` passes 49 tests, 40 of them the opener suite, which now pins the single-token argv for the `win32` and WSL-translated cases.

A probe drove `runDesktopHost` over the real framed byte pipes, which is the path Electron's protocol handler uses. `GET /api/present.host` answered 200 `{"name":"BrainX","available":true,"fileManager":"explorer"}`; `POST /api/host.describe` answered 200 with `canOpenPath: true`; `POST /api/host.openPath` answered 200 and the Host really ran `powershell.exe -NoProfile -Command Invoke-Item -LiteralPath '…'` (the bogus probe path fails inside PowerShell, which is the proof the dispatch reached the native opener rather than a stub); `POST /api/session.list` answered 200 through the Typert interceptor. A reveal probe showed the intercepted argv `[["explorer.exe",["/select,file:///E:/…/reveal%20probe%2C%20dir/target%20file%2Cwith%20comma.txt"]]]` and `openWorkspacePath(reveal)` resolving.

`npx tsc -b tsconfig.host.json` (which includes `apps/desktop/tests`) and oxlint over the changed files pass.

One behavior is recorded rather than changed: `POST /api/present.open` with invalid coordinates answers 415 from the gateway, because the dispatcher treats Connection's own 404 as the fallback trigger. That is the same order `packages/client/connection/src/index.ts` composes on the Web surface, and it is why a probe using a bogus `sessionId` saw 415 — a real card with a valid file is answered 204 and returns before the fallthrough.

## Alternatives considered

**Restore the fork's desktop host instead of patching the upstream composition.** `apps/desktop/src/host.ts`, its `DESKTOP_APIPROXY_PATCH`, and the local shell it belonged to are all still in history. Rejected: the alignment adopted upstream's architecture deliberately, and the tray and carrier were already recorded as intentional losses. It would also not have been sufficient — the `sdkwork-desktop-app` bundle mounts `sdkwork-api-gateway` but never `apiproxy`, so the fallback would have stayed 404.

**Put the rows in `packages/bundle/sdkwork-desktop-app/cordis.patch.yml`.** Rejected: nothing loads that bundle any more. `loadProfileDirectory('dsh desktop', …)` resolves bundles from the installed `@deepseek-ai/dsh`, which lists only `dsh-base` and `dsh-web-app`, and the launcher's sole overlay is the desktop-host file. The row would have been dead code that made the fix look applied while the 404 stayed — which is the state a first attempt at this fix actually reached before the probe disproved it.

**Quote the Windows path instead of sending a URI.** `explorer.exe /select,"C:\path"` is the documented plain-path form, but from `execFile` it needs the embedded quotes escaped, and a path with a space or a comma then has to survive two parsers. The URI keeps both out of the command line, which is why the target shape was kept and only the token split removed.

## Consequences

The desktop surface's `/api` roster answers again, and the failure mode that produced this report — a fork row silently dropped from an upstream-owned overlay while its dependency stayed behind — now fails a test instead of reaching a user. The overlay's insert list is pinned, so re-adding a superseded fork row also fails rather than double-rendering the shell.

`POST /api/host.openPath` now reaches the OS opener on every Host platform, and the reveal gesture hands Explorer the one token it documents. The merge-time re-verification remains with [the upstream sync procedure](../process/2026-08-21-upstream-sync-procedure.md), whose 2026-09-10 record ([the b2e3b2a012 sync](../process/2026-09-10-upstream-sync-b2e3b2a012.md)) is the alignment this note repairs; packaging and updater behavior stay as described in [the Electron desktop packaging note](../architecture/2026-08-25-electron-desktop-packaging-and-updates.md), and the icon and tray decisions in [the desktop app-icon note](2026-09-10-desktop-app-icon-merge-stability.md).
