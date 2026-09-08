---
description: "Markets app-mode plugin: the market quick entry and the keyed center-column page whose header tabs host the Plugins, Experts, Skills, and Connectors markets and whose Plugins tab carries the add flows (skill-driven plugin creation, add-market entry dialog)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

English | [中文](README.zh.md)

## Summary

The Markets app-mode plugin owns the `markets` sidebar quick entry and the keyed `mode.page` page. The page header carries the category tab bar (Plugins, Experts, Skills, Connectors) on the left and the catalog tools on the right: a per-category search field and, on the Plugins tab, the add affordance. The add trigger opens a two-item menu: "Create plugin" dispatches a skill-guided creation prompt into a fresh conversation, and "Add plugin market" opens the entry dialog, which records a market's provenance (GitHub `owner/repo`, Git URL, or local folder, with an optional Git ref and sparse-checkout path) and submits it as one composed prompt. Both flows run through the same prompt dispatch channel because the harness has no direct market API yet. The page is public: it renders signed out and mounts no IAM session face.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Browser bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin registers the sidebar entry and the keyed page through `ctx.slots`, the dictionaries through `ctx.locale`, and the mode switch through `ctx.layout`. The page is public — it renders signed out and mounts no IAM session face, so the catalog stays browsable before sign-in. The add flows need the sessions and workspaces services: dispatch switches the frame to the `code` mode, runs the shared New Session flow, waits (bounded) for the fresh session to become current, and sends the composed prompt into it as a queued text turn.

## Browser bundle

The client plugin emits one `client.js` closure with self-contained CSS modules and inline SVG glyphs. It depends on no sibling SDKWork checkout, so local installs build without extra workspace sources.

## Model Experience

The prompt dispatch channel only submits user-authored text as a queued text turn; the plugin adds no prompt content, tools, or session events of its own. The conversation agent performs the actual plugin creation (guided by the available plugin-creation skill) and market addition (fetching the repository, sparse checkout when needed, and reading its plugin manifest).

#### KV Cache effect

None; the flows add no provider-side cacheable content beyond the submitted prompt text.

## Known Limitations and Deferred Work

- **Empty panels** — every category panel renders a construction or empty notice until its real catalog surface lands.
- **Conversation-executed add flows** — create-plugin and add-market entries dispatch composed prompts because no direct host market API exists yet; failures surface inside the conversation rather than in the page.
- **Plugins-only add affordance** — the add trigger mounts on the Plugins tab; the other tabs keep the inert my-catalog affordance.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The prompt dispatch is the single execution channel for both add flows: it calls `ctx.layout.setMode('code')`, then `ctx.workspaces.startSession()`, and waits up to a bounded timeout for `ctx.sessions.list` to land a new current session before sending the prompt. When no session lands (connect failure, no workspace), the frame stays on the conversation surface where the user can act directly. The add-market dialog composes its prompt by template substitution with locale-owned fallbacks for blank ref and sparse-path fields.

</details>

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store's declared action set and the entry/page registrations follow the keyed dispatch; store/mode agreement is covered directly by this package's client behavior specs.
