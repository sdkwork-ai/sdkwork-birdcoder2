---
description: "SDKWork IM connector: the rail shortcut above Settings that opens the built-in IM management panel, under the connector's own name."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-connector

English | [中文](README.zh.md)

## Summary

The IM connector's product surface: one rail shortcut in the mode rail's `mode.rail.panel` seat, directly above Settings, and the keyed `mode.page` it opens. Clicking the shortcut switches the frame to the connector's own `im` mode page, which renders the IM management panel published by the linked `@xmanrui/dsh-im` plugin (`dshImClient` v1). The surface behaves like the app store and the other rail modes: the left icon rail and the page fill the frame, and the workspace/session sidebar is not shown. It carries the product name "IM链接器" (English "IM connector") — the connector role, not the plugin's internal "IM机器人" panel copy — with [a linked-bubbles glyph](src/client/ImConnectorIcon.tsx) in the rail's outline weight.

The page always renders the complete management interface. Rendering depends on the plugin's panel service, never on a channel being connected or bound: an unlinked account, a stopped bot, or an unreachable gateway keeps the channel cards, QR flow, and settings on screen, with the panel's own state copy describing what failed. The shortcut and the page appear only while that service exists, so a composition without the IM plugin shows no dead icon, and a plugin teardown removes both registrations.

A rail shortcut is the panel's one navigation entry: `ui-sidebar` filters a panel exposed in `mode.rail.panel` out of its own `sidebar.panellist` row list. The shortcut registers under the plugin's published panel id (the same id its own row uses), so the IM panel is not listed twice in the sidebar.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome; opening the IM panel changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The panel identity is a published string** — the shortcut registers under `xmanrui-dsh-im`, the main-panel key the linked IM plugin owns, so `ui-sidebar` can drop the plugin's duplicate row. A rename upstream means updating this package's constant; the plugin exports no id for hosts to import.
- **The mode id is host vocabulary** — `im` is added to `AppModeId` and the window-title dictionary by this integration. A second IM surface would share that one mode page.
- **The plugin's own copy is untouched** — dsh-im keeps its "IM机器人" / "IM bots" copy inside its settings section and plugin-detail action. Only the rail entry and the mode page title carry the connector name, because the host does not edit the plugin's bundle.
- **The plugin page keeps its own open action** — dsh-im's plugin-detail button selects its `main` panel in the code surface (sidebar visible), which is a separate navigation path from this shortcut.
- **Only the compiled service is followed** — the optional dsh-im desktop integration registers a second panel id (`dsh-im`) outside this composition; the shortcut follows `xmanrui-dsh-im` alone.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The mode page and the rail shortcut are pure projections of one framework fact: the linked plugin's `dshImClient` v1 service. The child injection owns both registrations, so the service's lifetime is the navigation's lifetime and no state is stored here. The rail's `mode.rail.panel` seat hands the entry the frame's `activeMode`; the page wraps `dshImClient.render()` in the plugin page's own surface geometry. Keep the panel id as the plugin's published navigation key; do not reach into the plugin's component tree or copy its panel.

</details>

## Runtime invariants

No runtime invariant companion is published; both registrations are a direct projection of the `dshImClient` service, and the registration lifetime, the mode switch, and the selection styling are covered by this package's client behavior specs.
