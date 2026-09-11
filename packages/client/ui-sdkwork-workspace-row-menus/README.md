---
description: "SDKWork fork plugin: the row-action menus of the sidebar workspace browser, extracted from ui-workspace into a fork-owned package so fork-side menu extensions stay cohesive and merge-stable."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-workspace-row-menus

English | [中文](README.zh.md)

## Summary


SDKWork fork plugin: the row-action menus of the sidebar workspace browser — the workspace (project) ellipsis menu, the session ellipsis menu, and the project-row context menu — extracted from `ui-workspace` into a fork-owned package so fork-side menu extensions stay cohesive and merge-stable.

## Table of Contents

- [What it owns](#what-it-owns)
- [How it integrates](#how-it-integrates)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## What it owns

- **Workspace menu** (project row `⋯`): open folder, copy path, open terminal (path rows, enabled only with a working directory), publish project, rename, delete workspace (danger).
- **Session menu** (session row `⋯`): the same path rows plus copy session id, export session log, rename, fork, archive.
- **Project context menu** (project row right-click): the same entries as the workspace menu, dispatched through the same callbacks.
- The dedicated `sdkwork-workspace-row-menus` locale namespace (zh/en).

The menus render through the shared `ui-primitives` `Menu` primitive (portal, pointer-leave grace, danger styling) — this plugin owns only the business rows and their dispatch. The two Host RPCs (open folder, open terminal) report their outcome through a `Toast` result banner: the acknowledged copy on success, the retryable copy on failure, so a refused `host.openPath` never presents as a dead click.

## How it integrates

`ui-workspace` stays the surface owner (rows, hover cards, drag, dialogs). Its browser registration declares the child hole `sidebar.workspaces.rowMenus` and renders it via `renderSlot`; this plugin registers the menu renderer into that hole. When the hole is unoccupied the browser falls back to its built-in upstream menu implementation, so a composition without this plugin keeps the stock behavior.

Actions (rename/fork/archive/delete) stay browser-owned: the menu components receive the row payloads plus the same action callbacks the built-in menus use, and dispatch them unchanged.

## Dev Note

The `sidebar.workspaces.rowMenus` hole and its built-in fallback live in `ui-workspace` (upstream-owned surface, fork-adapted registration), so upstream merges cannot collide with this package: only this package's renderer registration and locale namespace are fork-owned.

## Model Experience

None, as the package is human-only surface chrome. The row menus render sidebar entries and dispatch browser-owned actions; the two Host RPCs they send (`host.openPath`, `host.openTerminal`) carry a filesystem path and register no prompt, schema, or result text of their own.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Row scope** — the menus serve the sidebar browser's workspace and session rows; every other surface still renders ui-workspace's built-in upstream menus.
- **No desktop gate before the click** — a Host without a desktop opener (`host.describe.canOpenPath: false`) is not checked before dispatch; the refused RPC reports through the result banner instead of disabling the rows up front.
