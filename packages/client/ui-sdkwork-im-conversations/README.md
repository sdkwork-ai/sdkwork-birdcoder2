---
description: "SDKWork IM conversation list mode: the chat rail entry with the inbox unread badge, the keyed chat mode page that mounts the IM conversation-list surface, and the im.chat.pane seat the conversation plugin fills"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-conversations

English | [中文](README.zh.md)

## Summary

The plugin owns the `chat` app mode: a rail entry (with the inbox unread badge
and the chat/contacts glyph set) and the keyed `mode.page` page. The page is a
two-column shell — the mounted IM conversation list on the left, the selected
conversation on the right — and declares the `im.chat.pane` seat so the
conversation UI is contributed by its own plugin.

Selection and unread totals come from `ctx.im` (ui-sdkwork-im). The page never
talks to IM transport directly and never imports IM sources: the list is mounted
from the deployment's embed bundle through `ctx.im.mountSurface`, and the pane
seat is rendered by ui-sdkwork-im-chat.

## Runtime requirements

Requires the rail and mode-page slot contracts (`ui-sdkwork-app-modes`,
`ui-layout`), the IAM gate (`ui-sdkwork-iam`), and `ctx.im`. Signed out, the
IAM shell replaces the page with its sign-in notice.

## Model Experience

None, as the plugin renders a human-facing messaging surface and does not add
prompt content, tools, or session events.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Conversation search is not wired** — the IM list keeps its own search field
  behavior; the host does not pass a search term yet.
- **Failures stay inside the product shell** — the two-column page keeps its
  list and pane visible with a product-shaped placeholder while the shared
  Toast names a failed bundle load, a missing gateway, or an unauthenticated
  session; there is no retry control until the host adds one.
