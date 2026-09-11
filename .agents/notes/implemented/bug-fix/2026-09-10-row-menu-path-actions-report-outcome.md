# Agent Note: Row-menu path actions report their outcome instead of failing silently

Status: implemented

English | [中文](2026-09-10-row-menu-path-actions-report-outcome.zh.md)

## Problem

The sidebar row menus' 打开文件夹 and 在终端打开 rows dispatched `workspaces.openPath`/`openTerminal` through the same swallow-everything helper as the clipboard writes. When the Host refused the RPC, the rejection died in `runAction`'s empty catch and the click presented as a dead row. That silence is what made the [desktop `/api` fallback outage](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.md) look like "the menu is not implemented" or "a permission problem": the renderer had no channel to say the request had been sent and refused. The same silence covers every future refusal — a Host without a desktop opener (`host.describe.canOpenPath: false` on a headless Linux deployment), a deleted working directory, or a stale installed composition.

## Decision

The two Host RPCs report their outcome through the `ui-primitives` `Toast` banner; the clipboard write stays fire-and-forget. Success shows the dictionary's acknowledged copy (`feedback.opened` / `feedback.terminalOpened` — keys that had existed in the namespace unused), failure shows the retryable copy (`feedback.openFailed` / `feedback.terminalFailed`), and the Host's raw error text goes to the console as diagnostics rather than product copy. The report never re-raises: the dispatch still cannot throw out of a menu click, which the degradation tests pin. The sequence-keyed remount restarts the banner's hold window on back-to-back actions.

The banner lives in both menu components (`WorkspaceRowMenu`, `SessionRowMenu`) through one shared hook, because each owns its dispatch; the plugin contract (`RowMenusWorkspacesPort`, slot owner props) is unchanged, so no consumer or composition row moves.

## Alternatives considered

**Gate the rows on `host.describe`'s `canOpenPath` the way ui-deliverables does.** Rejected for now: the row-menus plugin receives only the `workspaces` port, so gating needs a new injected service face, a slots-contract change, and a composition update in the same change. The banner answers the reported failure with a much smaller surface; a Host without a desktop still shows 已打开 on an accepted RPC because `host.openPath` refuses at the opener only when the open actually fails, and that refusal now reads as 无法打开文件夹，请重试 instead of silence.

**Show the Host's error text in the banner.** Rejected: the apiproxy failure message carries PowerShell stderr and code vocabulary; the banner is a four-second top-center strip, and the actionable copy is "try again" plus the console line.

## Consequences

A refused open-folder gesture now names itself in the UI and leaves a console diagnostic, so the next composition outage is a bug report with evidence instead of "the button does nothing". The acknowledged banner also documents the RPC acceptance on success, which on a remote or headless Host is the honest claim — the Host accepted the open, not the user's machine. Every future path-action surface added to this plugin inherits the reporting hook through `dispatchPathAction`.

## Verification

`pnpm vitest run ui-sdkwork-workspace-row-menus` (21 tests) covers the acknowledged banner, the retryable banner with a rejecting `openPath` plus a console spy, and the pre-existing degradation rows; the ui-workspace slot integration suite `row-menus-plugin.client.spec` passes unchanged. The package bundle is rebuilt (`pnpm run bundle`), so the desktop carrier serves the new revision after the next shell restart.

An end-to-end probe against the installed desktop project drove `runDesktopHost` directly over the same entry the Electron shell spawns: `host.describe` returned 200 with `canOpenPath: true` and `host.openPath` returned `{ opened: true }` with a real Explorer window for the target directory — the Host side of the gesture, including the privileged-method loopback fence, works on the current composition.
