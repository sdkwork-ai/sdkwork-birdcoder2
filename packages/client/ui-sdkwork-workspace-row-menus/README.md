---
description: "SDKWork fork plugin: the row-action menus of the sidebar workspace browser (workspace ellipsis, session ellipsis, project right-click), plus the app-build actions those menus dispatch — compile, package, publish — with a streamed build-output panel and a conversation-header build indicator."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-workspace-row-menus

English | [中文](README.zh.md)

## Summary


SDKWork fork plugin: the row-action menus of the sidebar workspace browser — the workspace (project) ellipsis menu, the session ellipsis menu, and the project-row context menu — extracted from `ui-workspace` into a fork-owned package so fork-side menu extensions stay cohesive and merge-stable.

The same package owns the workspace **app-build actions**: the workspace menu probes its project through the `sdkworkAppBuild` host Remote, offers a compile and a package submenu listing the commands that project's app roots actually declare, and streams each run into a floating build-output panel that any running task can also collapse into a conversation-header indicator.

## Table of Contents

- [What it owns](#what-it-owns)
- [How it integrates](#how-it-integrates)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## What it owns

- **Workspace menu** (project row `⋯`): open folder, copy path, open terminal (path rows, enabled only with a working directory), compile, package, publish project, rename, delete workspace (danger).
- **Session menu** (session row `⋯`): the same path rows plus copy session id, export session log, publish project, rename, fork, archive.
- **Project context menu** (project row right-click): the same entries as the workspace menu, dispatched through the same callbacks.
- **App-build rows** (workspace menu): a compile and a package submenu derived from one probe of the project's `apps/` tree. Every row is backed by a script that app root really declares, so a row can never be a dead click. Families the standard names but this project cannot build appear as disabled notes carrying the reason. A row the host reports as unrunnable is disabled too, with the reason the HOST gave — cross-platform target (`package:win:x64` off Windows, `mac-arm64` off Apple Silicon), uninstalled toolchain (`flutter build ipa` without Xcode, an Android lane without an SDK), or an entry file the script names but the tree does not carry (`scripts/build-mini-program.mjs`). The renderer only formats that verdict; it never re-derives it, because a browser or remote composition is not the build host.
- **Build output panel**: one card per launched compile/package task — resolved command, working directory, streamed stdout/stderr, live completion when the tool prints one, cancel, minimize and dismiss — mounted on `document.body` so it survives the menu closing and keeps showing a build that is still running.
- **Conversation-header build indicator**: the seat a running build collapses into. Every tracked task puts a control in the conversation header's right-aligned utility cluster; while anything is building it turns and pulses with a count of live builds, and clicking it lists every tracked build — label, status, live elapsed time, and a progress bar. Clicking a row restores that task's card (open detail). Minimising is per task, so a long package can be parked in the header while another build stays in the panel.
- The dedicated `sdkwork-workspace-row-menus` locale namespace (zh/en).

The menus render through the shared `ui-primitives` `Menu` primitive (portal, pointer-leave grace, danger styling, submenus) — this plugin owns only the business rows and their dispatch. The two Host RPCs (open folder, open terminal) report their outcome through a `Toast` result banner: the acknowledged copy on success, the retryable copy on failure, so a refused `host.openPath` never presents as a dead click.

## How it integrates

`ui-workspace` stays the surface owner (rows, hover cards, drag, dialogs). Its browser registration declares the child hole `sidebar.workspaces.rowMenus` and renders it via `renderSlot`; this plugin registers the menu renderer into that hole. When the hole is unoccupied the browser falls back to its built-in upstream menu implementation, so a composition without this plugin keeps the stock behavior.

Actions (rename/fork/archive/delete) stay browser-owned: the menu components receive the row payloads plus the same action callbacks the built-in menus use, and dispatch them unchanged.

The app-build half crosses packages through an injected Cordis service, never through imports: this plugin provides `appBuild` (probe + run) and the row menus consume it from their inject face. The host capability behind it is optional — a composition without the `sdkworkAppBuild` Remote still loads these menus and simply shows no build rows.

The build indicator registers into `conversation.session.header.utilities` through `slots.inject`, which subscribes to the declaration instead of requiring it: a composition that never mounts `ui-conversation` leaves the entry dormant rather than failing this plugin, exactly as the app-build rows degrade without their Remote. The entry takes a type-only import of the owning package so the slot key is in the program, and no runtime edge is created.

## Dev Note

The `sidebar.workspaces.rowMenus` hole and its built-in fallback live in `ui-workspace` (upstream-owned surface, fork-adapted registration), so upstream merges cannot collide with this package: only this package's renderer registration and locale namespace are fork-owned.

The `src/client/appBuild/` domain keeps that half self-contained: `contract.ts` (structural wire and service types), `catalogCache.ts` (TTL + in-flight coalescing), `menuRows.tsx` (catalog → menu rows), `progress.ts` (completion read off the tool's own output), `BuildPanel.tsx` (pure panel component), `panelHost.ts` (task state, Remote driving, React root, header snapshot), `BuildIndicator.tsx` (header control and its list). Catalog types are declared structurally rather than imported from the generated transport package, so this plugin keeps no compile-time edge on it.

The header surface reads a **separate snapshot** from the panel: `AppBuildTrack` carries label, status, completion and timing but deliberately not the output lines. The header re-renders on every output batch and on every tick of the elapsed clock, and copying a 5000-line transcript through it thousands of times per build is the difference between an indicator and a stall. The host publishes only when a field the header shows has changed, so output bursts that carry no progress figure cost nothing.

## Model Experience

None, as the package is human-only surface chrome. The row menus render sidebar entries and dispatch browser-owned actions; the Host RPCs they send (`host.openPath`, `host.openTerminal`) carry a filesystem path and register no prompt, schema, or result text of their own. The app-build rows start package-manager scripts on the host and stream their output back — no provider request and no Session state is involved.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Row scope** — the menus serve the sidebar browser's workspace and session rows; every other surface still renders ui-workspace's built-in upstream menus. App-build rows are workspace-scoped only, because compile and package act on a project rather than a session.
- **No desktop gate before the click** — a Host without a desktop opener (`host.describe.canOpenPath: false`) is not checked before dispatch; the refused RPC reports through the result banner instead of disabling the rows up front.
- **Only what the workspace declares** — the submenus list the scripts that exist in `apps/*/package.json` today. A family whose build command is not wired anywhere in the toolchain (HarmonyOS) is reported as a disabled note rather than offered, and a family with no `package:*` script says so instead of showing an empty submenu.
- **Builds are host processes** — a started build runs on the host. Dismissing its card stops the output stream but not the process (cancellation is a separate, explicit gesture), and the host caps concurrent builds at three.
- **Progress is best-effort** — the frame protocol carries no progress channel, so completion is read from the tool's own output: a trailing `45%` or a `[3/10]` step marker. A tool that prints neither gets an indeterminate sweeping bar rather than a fabricated number, and a tool that prints a figure for something other than its own completion can move the bar wrongly. A run that is no longer active also stops moving, because a terminal row that still shimmers reads as a hang: success fills the bar whatever the last printed figure was (a bundler stops reporting before it stops running), a run that stopped early keeps however far it got, and a completely unknown distance reads as an empty track rather than a full one. Elapsed time and the status word are always exact.
- **The indicator is host-global, not session-scoped** — the header seat is session-scoped, but the builds behind it are host processes started from the sidebar. Every open session shows the same list, so a build launched from one workspace stays findable from wherever the operator happens to be looking.
