---
description: "Markets app-mode plugin: the market quick entry and the keyed center-column page whose header tabs host the Plugins, Experts, Skills, and Connectors cloud catalogs, plus the add flows (skill-driven plugin creation, add-market entry dialog). The Plugins tab leads with the community Plugin Market (the dshmarket plugin's own catalog) ahead of the cloud catalog and this deployment's own plugin views, and lands on it; that Plugins surface replaces the upstream Plugins page."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

English | [中文](README.zh.md)

## Summary

The Markets app-mode plugin owns the `markets` sidebar quick entry and the keyed `mode.page` page. The page header carries the category tab bar (Plugins, Experts, Skills, Connectors) on the left and the catalog tools on the right: a per-category search field and, on the Plugins tab, the add affordance. The add trigger opens a two-item menu: "Create plugin" dispatches a skill-guided creation prompt into a fresh conversation, and "Add plugin market" opens the entry dialog, which records a market's provenance (GitHub `owner/repo`, Git URL, or local folder, with an optional Git ref and sparse-checkout path) and submits it as one composed prompt. Both flows run through the same prompt dispatch channel because the harness has no direct market API yet. The Experts tab's my-catalog affordance opens the full-page My-experts view: roster tabs (experts, teams) with their counts, a created/purchased source scope, and a create-expert trigger whose hover menu lists the three expert types. The remote type enters the SDKWork Agents create flow — the capability package's basic-info dialog (name, avatar, type, summary) first, then the agent editor (system prompt, model, memory, capabilities, preview chat) as a full-body swap — through the embedded create-expert host adapter; the local and personal-VM types keep dispatching their guided creation prompts into a fresh conversation. The remote row is disabled while no gateway is configured. The page is public: it renders signed out and mounts no IAM session face; the create flow's backend calls are held at the transport gate until the sign-in overlay resolves.

The Plugins tab is the product's plugin surface. Its sub-tab row leads with the **Plugin Market** — the community catalog provided by the `dshmarket` profile plugin, rendered from the `market` control service that plugin publishes (`render({ surface: 'plugins' })`) — and that chip is the landing view, so opening Plugins and every re-entry lands on it; then the **cloud catalog** (the SDKWork App Store's plugin catalog), then this deployment's own `official` and `installed` views: the official/installed bundles, each bundle's own `plugins.bundle.config` form, the components it declares with their per-row switches, the install dialog, and a bundle's post-enable `plugins.bundle.activation` guidance. The market owns its own search, categories, install dialog, updates, backups, and diagnostics, so this page draws no chrome around it and duplicates none of it: while that chip is active the page keeps its **Add menu** (create plugin / add plugin market) in the header but drops its own search field, because a second search beside the market's own would read as broken. The market service is optional by construction: a deployment without `dshmarket` keeps the leading chip and shows an install affordance that runs the same installation pipeline the local views use, while a deployment that holds the bundle but has not loaded its browser half yet shows the page-reload prompt that loads it, and a bundle that was switched off is sent back to the installed roster instead of being told to reload. The install affordance never offers a write on a deployment that does not manage a profile. This package **replaces** the upstream Plugins page rather than sitting beside it: it declares the seven plugin-configuration seats that page declared — a slot has exactly one declarer, so a second children table for the same key would make the client refuse to load — and it provides the `pluginNavigation` service that page provided, so a plugin contributing to either surface keeps working unchanged. The composition hides `ui-plugin-manager` for exactly as long as this row runs and restores it when this row is switched off, so the enabled plugin surface is always exactly one page. The other categories (Experts, Skills, Connectors) keep the four-tab experience.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Browser bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin registers the sidebar entry and the keyed page through `ctx.slots`, the dictionaries through `ctx.locale`, and the mode switch through `ctx.layout`. The page is public — it renders signed out and mounts no IAM session face, so the catalog stays browsable before sign-in. The plugin declares `slots`, `locale`, `layout`, `sessions`, `workspaces`, `env`, `iam`, and `theme`. The add flows need the sessions and workspaces services: dispatch switches the frame to the `code` mode, runs the shared New Session flow, waits (bounded) for the fresh session to become current, and sends the composed prompt into it as a queued text turn. The Plugin Market's control is consumed as an optional service (`ctx.inject(['market'], …)`): it is provided by the `dshmarket` profile plugin at activation time, so the page waits for it instead of requiring it and attaches or detaches as that plugin loads or unloads.

## Browser bundle

The client plugin emits one `client.js` closure with self-contained CSS modules and inline SVG glyphs. The market pages embed the SDKWork App Store PC surface, and the remote-expert create flow embeds the SDKWork Agents PC create surface, so the bundle inlines those sibling checkouts' sources (the joined `../sdkwork-*` workspace members; see the repository's `pnpm-workspace.yaml`), and local installs need those checkouts beside this repository.

## Model Experience

The prompt dispatch channel only submits user-authored text as a queued text turn; the plugin adds no prompt content, tools, or session events of its own. The conversation agent performs the actual plugin creation (guided by the available plugin-creation skill) and market addition (fetching the repository, sparse checkout when needed, and reading its plugin manifest).

#### KV Cache effect

None; the flows add no provider-side cacheable content beyond the submitted prompt text.

## Known Limitations and Deferred Work

- **Empty panels** — every category panel renders a construction or empty notice until its real catalog surface lands.
- **Empty experts roster** — the My-experts page renders count chips over an empty roster with the per-scope empty notice until the experts catalog store lands and feeds it; a just-created expert appears in the Agents editor but not yet in this roster.
- **Conversation-executed add flows** — create-plugin and add-market entries dispatch composed prompts because no direct host market API exists yet; failures surface inside the conversation rather than in the page. The remote-expert create flow is the exception: it runs entirely inside the page through the embedded Agents create surface.
- **Gateway-gated remote experts** — the create flow's first step persists the agent through the Agents app API, so the remote row is disabled until the environment service carries a gateway; signed-out users hit the sign-in overlay at the transport gate.
- **Plugins-only add trigger** — the add trigger mounts on the Plugins tab (both the Plugin Market and the cloud catalog); the Experts tab's my-catalog affordance opens the My-experts page, and the Connectors tab keeps the inert my-catalog affordance. While the Plugin Market chip is active the trigger stays in the header and only the page's search field is dropped, since the market's own page carries its own search.
- **The Plugin Market is a guest** — the community catalog, its install/update/backup flows, and its diagnostics belong to the `dshmarket` profile plugin. This page supplies the tab and the viewport, renders the control that plugin publishes, and offers installation and reload affordances; it does not reimplement or pin the market's behavior, so a market update ships through that package. The tab's install affordance exists only where the Host manages a profile.
- **Upstream's page is the fallback, never a companion** — a fork composition hides `ui-plugin-manager` while this row runs and brings it back when this row is switched off, so the plugin surface can never render twice; enabling both by hand is a load failure by design, not a duplicate page.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The prompt dispatch is the single execution channel for both add flows: it calls `ctx.layout.setMode('code')`, then `ctx.workspaces.startSession()` through the runtime face of the workspaces provision, and waits up to a bounded timeout for `ctx.sessions.list` to land a new current session before sending the prompt. When no session lands (connect failure, no workspace), the frame stays on the conversation surface where the user can act directly. The add-market dialog composes its prompt by template substitution with locale-owned fallbacks for blank ref and sparse-path fields.

The remote-expert create flow runs through `expertsHost.tsx`, the session/port adaptation template every SDKWork surface package owns: it binds the Agents, Memory, Voice, Skills, Knowledgebase, and Drive generated clients to the active gateway and IAM session (a request fired while signed out is held at the sign-in gate), re-derives them on environment changes, and reports gateway readiness to the create affordance. The capability package's create surface (basic-info dialog and editor) loads code-split on first use, and the knowledge-selection adapter is bound when that surface loads because its state lives in the capability package's own module registry.

</details>

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store's declared action set and the entry/page registrations follow the keyed dispatch; store/mode agreement is covered directly by this package's client behavior specs.
