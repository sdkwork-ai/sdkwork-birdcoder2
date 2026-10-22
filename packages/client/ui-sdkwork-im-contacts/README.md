---
description: "SDKWork IM contacts mode: the contacts rail entry and the keyed contacts mode page that mounts the IM contacts-directory surface and opens conversations in the chat mode"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-contacts

English | [中文](README.zh.md)

## Summary

The plugin owns the `contacts` app mode: a rail entry (contacts glyph set) and
the keyed `mode.page` page. The page mounts the IM contacts directory
(`ContactsView`: friends, friend requests, groups, profile detail) from the
deployment's IM embed bundle through `ctx.im.mountSurface`.

"Send message" from the directory flows back through `ctx.im.openConversation`,
which selects the conversation and switches the frame to the chat mode; the
contacts page closes with that navigation and never re-implements chat
creation.

## Runtime requirements

Requires the rail and mode-page slot contracts (`ui-sdkwork-app-modes`,
`ui-layout`), the IAM gate (`ui-sdkwork-iam`), and `ctx.im`. Signed out, the
IAM shell replaces the page with its sign-in notice. A failed bundle load, a
missing gateway, or an unauthenticated IM session leaves the product-shaped
directory shell mounted and reports the failure through the shared Toast.

## Model Experience

None, as the plugin renders a human-facing directory and does not add prompt
content, tools, or session events.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No friend-request badge** — the rail entry does not badge pending friend
  requests yet; the directory itself shows them.
- **Directory search is owned by the surface** — the page does not pass a host
  search term into the mounted directory.
