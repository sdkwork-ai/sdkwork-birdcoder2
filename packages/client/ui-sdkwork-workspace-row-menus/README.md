# @deepseek-ai/dsh-client-ui-sdkwork-workspace-row-menus

English | [中文](README.zh.md)

SDKWork fork plugin: the row-action menus of the sidebar workspace browser —
the workspace (project) ellipsis menu, the session ellipsis menu, and the
project-row context menu — extracted from `ui-workspace` into a fork-owned
package so fork-side menu extensions stay cohesive and merge-stable.

## What it owns

- **Workspace menu** (project row `⋯`): rename, delete workspace (danger).
- **Session menu** (session row `⋯`): rename, fork, archive.
- **Project context menu** (project row right-click): the same entries as the
  workspace menu, dispatched through the same callbacks.
- The dedicated `sdkwork-workspace-row-menus` locale namespace (zh/en).

The menus render through the shared `ui-primitives` `Menu` primitive (portal,
pointer-leave grace, danger styling) — this plugin owns only the business
rows and their dispatch.

## How it integrates

`ui-workspace` stays the surface owner (rows, hover cards, drag, dialogs).
Its browser registration declares the child hole
`sidebar.workspaces.rowMenus` and renders it via `renderSlot`; this plugin
registers the menu renderer into that hole. When the hole is unoccupied the
browser falls back to its built-in upstream menu implementation, so a
composition without this plugin keeps the stock behavior.

Actions (rename/fork/archive/delete) stay browser-owned: the menu components
receive the row payloads plus the same action callbacks the built-in menus
use, and dispatch them unchanged.
