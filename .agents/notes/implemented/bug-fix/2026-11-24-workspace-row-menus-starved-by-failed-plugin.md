# Agent Note: Workspace row menus starved by a failed plugin

Status: implemented

English | [中文](2026-11-24-workspace-row-menus-starved-by-failed-plugin.zh.md)

## Problem

The workspace (project) and session rows of the sidebar lost every path action — Open folder, Copy path, Open in terminal — together with the publish rows, leaving only Rename and Delete workspace. The rows had silently fallen back to the built-in upstream menus.

The cause was a required-inject chain, not the menu code. `ui-sdkwork-workspace-row-menus` declares the `sidebar.workspaces.rowMenus` renderer and listed `workspaces`, `sessionLogDownload`, `deployPublish`, `remote`, and `remote.sdkworkAppBuild` in its cordis `inject`. A plugin whose inject is unsatisfied stays pending, so nothing occupied the hole. `ui-sdkwork-deploy` began contributing a root-scoped `settings.dns` dialog while `ui-sdkwork-dns` already owned that single seat; the slot registry rejects the second registration, which fails the deploy fiber, so `deployPublish` never appeared and the row-menus plugin never activated. No user-visible error reported the failure: the empty hole simply rendered the upstream menus.

An assembled Web client reproduced it. The browser console carried `ui-sdkwork-deploy: failed: Error: single slot "settings.dns" already has a registration at priority 0`, and right-clicking a project row listed only Rename and Delete workspace.

## Decision

**Row menus require only the slot registry and the dictionaries.** Every action service and the dotted `remote.sdkworkAppBuild` namespace are read with `ctx.get` inside the slot's render-time inject closure. A plugin that registers later supplies its rows on the next render; a plugin that failed only removes its own rows (publish, compile/package, export) instead of the whole menu.

**`settings.dns` has one owner: `ui-sdkwork-dns`.** Its modal is the long-standing 域名管理 surface (root zones, subdomain verification files, DNS records, cloud-account sync). The duplicate `DomainCenterDialog` and its helpers, locale keys, and spec are removed from `ui-sdkwork-deploy`; the deploy plugin now loads and its existing surfaces return.

## Alternatives considered

**Keep the optional services in `inject` and repair only the slot conflict.** That restores today's menu but repeats the failure mode for any future dependency: an unrelated plugin failure would again remove path actions without any message.

**Register the deploy dialog at a different priority to shadow the DNS one.** A single seat with two registrations leaves one implementation permanently unreachable, and it still makes one domain row mean two different products. The slot kind is single on purpose; the second feature belongs to a separate seat if it is ever wanted.

**Add a second settings-menu row for the deploy domain center.** It duplicates the domain-management entry and needs a new settings seat plus copy; it is deferred until a product need separates "domain center" from "域名管理".

## Consequences

Open folder, Copy path, Open in terminal, Publish app, Publish as scaffold, and Install from scaffold render again from both the ellipsis trigger and the row right-click. The deploy plugin's publish flow and settings surfaces work, and 域名管理 keeps its single owner.

The row menus now perform a few `ctx.get` lookups per menu render instead of capturing services once at activation; a service that registers after the plugin appears without a reload. The cost is that a broken optional service is no longer visible as a missing menu; each menu degrades row by row.

The plugin spec boots the body with no optional services and asserts the renderer still occupies the hole. An assembled Web e2e right-click listed the three path rows and the three publish rows; the context-menu goldens now record the fork menu instead of the built-in one. The regression fix requires a rebuilt client bundle; an installed package does not pick up the source change.

Upstream's Mark as read / Mark as unread row is a shared-context-menu contribution, and this plugin replaces the whole session menu, so the fork session menu has never carried that row. The restored menu does not change that pre-existing divergence.
