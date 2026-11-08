---
description: "SDKWork assistant surface: the 助理 rail entry directly below Home and the two-way binding between that rail selection and the Bot team's surface preference"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-assistant

English | [中文](README.zh.md)

## Summary

The plugin owns the `assistant` app mode's rail entry: the 助理 icon directly
below Home, with `助理` as its tooltip and its accessible name in Chinese
(`Assistant` in English). Selecting it shows the Bot team, selecting any other
mode returns to the plain agent surface.

The Bot team (`ds-bot`) is a shell skin rather than a page: in Bot mode it
shadows the sidebar and the conversation cells of the Session the frame is
showing. So `assistant` is a shell mode in `ui-layout` — the frame keeps the
conversation, the left column, the right column and the Session title — and this
plugin owns only the entry plus the one fact tying the two together.

The Bot plugin publishes its surface choice as `ctx.botSurface` (an observable
plus a setter that runs the same action every internal control uses). While that
service is absent this plugin contributes nothing: no entry, and no surface is
forced, so a deployment without the Bot plugin shows neither a dead 助理 icon nor
a Bot surface it cannot leave. Both directions are reconciled through idempotent
writes, so the rail and the Bot plugin's own return control settle in one step
whichever side the user moved.

## Runtime requirements

Requires the rail-entry slot contract (`ui-sdkwork-app-modes`), the frame's
`assistant` shell mode and `ctx.layout.mode` (`ui-layout`), and `ctx.botSurface`
from the `ds-bot` client half. The service is a soft contract: it is declared
here because the plugin is an external package, and the bundle acceptance spec
(`packages/bundle/web-app/tests/built-in-bot.spec.ts`) fails when the shipped
client half stops publishing it.

## Model Experience

None, as the plugin renders a human-facing navigation entry and switches browser
viewing state. Nothing here reaches a model request, prompt, or session event.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **The mode and the surface are one preference** — a profile that composes both
  plugins starts on Home with the Bot surface withdrawn; the Bot plugin's own
  remembered surface is overwritten at mount. A deployment that wants the Bot
  team to be the landing surface must change the frame's default mode instead.
- **Assistant is a fixed rail entry** — the customize dialog cannot hide it. A
  user who does not want the Bot team in the rail can only drop the plugin row.
- **The Bot surface covers the rail while it is active** — in Bot mode the
  plugin's own left column is fixed over the frame's left edge, so the 助理 and
  Home entries are not visible; the rail returns with the agent surface (the
  plugin's Settings → switch control, or this entry from Home). That is the Bot
  plugin's shell design, not a choice this package makes.
- **English copy is generic** — the localized name is `Assistant`; the product
  word 助理 has no separate English counterpart.
