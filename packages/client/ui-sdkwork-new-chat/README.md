---
description: "SDKWork New Chat as an independent module: the new-conversation entry leading the sidebar's New Session button area, riding the shell's shared New Session action."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-new-chat

English | [中文](README.zh.md)

## Summary

The New Chat entry as an independent module: the new-conversation row that leads the sidebar's New Session button area (`sidebar.actions`, declared by ui-sidebar). The entry renders the compose glyph with its label in the wide column and the icon control in the collapsed rail, and it starts a Session through the shell's shared New Session action — the same Workspace UI flow the built-in capsule drove — so the plugin-owned entry and the stock control stay one capability. With no registrant the sidebar shell keeps its own capsule as the empty-list fallback.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome; starting a conversation changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Sidebar-scoped visibility** — the entry renders where the sidebar renders (the Code column and the collapsed rail); it is not a persistent rail control.
- **Per-package chrome** — the row geometry is this package's own stylesheet copy, so a shared quick-entry redesign means touching each registrant's styles, the same rule the rail entries follow.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The sidebar shell owns the seat and hands every entry the shared `startSession` action plus the wide flag; this package owns only its row chrome and copy. Capability parity with the built-in capsule is structural — both call the same injected action — so keep the entry registered against `sidebar.actions` and do not re-wire the Workspace UI service here.

</details>

## Runtime invariants

No runtime invariant companion is published; the entry is a pure function of the seat's owner share, and the shell's fallback behavior is covered directly by ui-sidebar's client behavior specs.
