---
description: "SDKWork IM conversation pane: fills the chat mode's im.chat.pane seat with the conversation surface from the deployment's IM embed bundle"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-chat

English | [中文](README.zh.md)

## Summary

The plugin owns exactly one seat: the `im.chat.pane` slot that
ui-sdkwork-im-conversations declares inside the chat mode page. It mounts the
conversation surface (`ChatWindow`: message history, composer, realtime
updates) from the deployment's IM embed bundle through `ctx.im.mountSurface`,
and swaps the mounted surface when the page selects another conversation.

The plugin compiles no IM sources and holds no IM data. The chat page owns
selection, the host adapter owns the bundle and the session, and sdkwork-im owns
the conversation UI.

## Runtime requirements

Requires `ctx.slots` and `ctx.im`. The pane renders only while the chat mode
page is mounted; the page provides the IM translation and toast context through
the embed bundle.

## Model Experience

None, as the plugin renders a human-facing messaging surface and does not add
prompt content, tools, or session events.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Selection-only pane** — group management, call overlays, and the member
  panel remain inside the full application shell; the pane renders the
  conversation window only.
- **One mount per conversation switch** — the pane reuses the mounted surface
  through `update`, but a conversation switch sends a new `conversationId` and
  the embed re-resolves the conversation metadata.
