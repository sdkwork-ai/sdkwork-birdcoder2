---
description: "Browse SDKWork's database-backed plugin catalog, search localized plugin details, and install published artifacts through the Host plugin manager. The Plugins page also manages this deployment's local plugin roster and links to the existing experts, skills, and connector catalogs."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

English | [中文](README.zh.md)

## Summary

Open Markets from the sidebar to browse SDKWork Plugins records, install a record's catalog target through the Host plugin manager, or manage locally installed plugins. The Experts, Skills, and Connectors views retain their existing App Store and embedded-plugin catalogs.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Browser bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The keyed page uses the generated SDKWork Plugins App SDK with the active gateway, locale, and shared IAM token manager. It renders the SDKWork Plugins catalog only when the host has an application credential; otherwise it opens the application's sign-in surface. The catalog returns artifact descriptors, and this package converts Git and Drive sources into the standard plugin-manager spec before starting the Host install dialog. The plugin also declares `slots`, `locale`, `layout`, `sessions`, `workspaces`, `env`, `iam`, and `theme`. Prompt-based plugin creation and skill actions use the sessions and workspaces services. The fork sidebar registry remains an optional service used to suppress the independently mounted SkillHub and MCP connector rows when their panels appear in this page.

## Browser bundle

The client plugin emits one `client.js` closure with self-contained CSS modules and inline SVG glyphs. The market pages embed the SDKWork App Store PC surface, and the remote-expert create flow embeds the SDKWork Agents PC create surface, so the bundle inlines those sibling checkouts' sources (the joined `../sdkwork-*` workspace members; see the repository's `pnpm-workspace.yaml`), and local installs need those checkouts beside this repository.

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store's declared action set and the entry/page registrations follow the keyed dispatch; store/mode agreement is covered directly by this package's client behavior specs.

## Understand the implementation

The page keeps its Plugins navigation and local management views around the catalog owned by SDKWork Plugins. The catalog fetches plugin and category records through the generated App SDK, displays localized fields, and installs a record's catalog target through the existing Host installer. The Add action opens the source form for direct installation, while Create plugin continues to dispatch a prompt into a fresh conversation. Experts, Skills, and Connectors keep their current catalog and embedded-panel views. The Experts tab's My experts page uses the SDKWork Agents create flow for remote experts and guided prompts for local and personal-VM experts. Cloud-backed SDKWork views show the host's sign-in surface when no application credential is available.

The Plugins tab leads with the SDKWork Plugins catalog. The generated App SDK reads categories and plugin records from the SDKWork Plugins backend database. Featured cards and popular rows use the record's localized titles, descriptions, icons, usage counts, artifact source, and install target. Install hands the record's target to this package's Host adapter, which resolves Drive download URLs, validates archive checksums, and starts the existing plugin-manager installation dialog; the same adapter joins the Host bundle roster back onto each card so an installed record shows its installed version, offers an update when the catalog has a newer registry version, and can be uninstalled. Manage opens the local installed roster, while Add opens the source installer. Catalog actions are disabled with a stated reason when the host lacks plugin-management capability, another install is running, or a record publishes no target. This package still replaces the upstream Plugins page, declares its seven plugin configuration slots, and provides the `pluginNavigation` service. The Skills, Experts, and Connectors tabs continue to embed their independent panels and suppress their duplicate sidebar rows.

## Model Experience

None, as the plugin adds no prompt content, tools, or session events; plugin creation and skill actions only submit user-authored text as an ordinary queued turn.

#### KV Cache effect

None; the flows add no provider-side cacheable content beyond the submitted prompt text.

## Known Limitations and Deferred Work

- **Empty panels** — the cloud catalogs render the App Store's own empty or construction face until the SDKWork catalog has content. The Connectors tab's cloud catalog is the App Store's MCP page; its connector chip is not a cloud panel: it frames the MCP connector plugin's own page.
- **Empty experts roster** — the My-experts page renders count chips over an empty roster with the per-scope empty notice until the experts catalog store lands and feeds it; a just-created expert appears in the Agents editor but not yet in this roster.
- **Conversation-executed create flows** — create-plugin entries dispatch composed prompts because they author files; failures surface inside the conversation rather than in the page. Installing a plugin from a source runs the plugin manager's install pipeline and reports progress in the install dialog. The remote-expert create flow runs inside the page through the embedded Agents create surface.
- **Archive and Drive installs are Host-side** — the page passes the standard spec and never downloads a package itself; the profile's plugin manager owns the download, unpacking, limits, and cache under `.plugin-manager/sources`.
- **Gateway-gated remote experts** — the create flow's first step persists the agent through the Agents app API, so the remote row is disabled until the environment service carries a gateway; signed-out users hit the sign-in overlay at the transport gate.
- **Plugins page behavior** — the Marketplace owns its catalog search and category filters. Its Manage action opens the installed plugin roster, and Add opens the source installer. The independent SkillHub market keeps its own add-menu entry only while its panel is registered.
- **SDKWork catalog authentication** — the marketplace needs an application Access-Token to call the SDKWork Plugins App API. The Host renders the shared sign-in surface until an IAM session or static environment token is available.
- **The SkillHub market is a guest too** — the catalog, its install/disable/rollback flows, its persistence, and the SkillHub proxy belong to `@montersy123/dsh-skill-market`, linked in as the `plugins/dsh-skill-market` submodule and mounted by the web-app bundle patch. This page supplies the Skills chip, draws that plugin's registered panel inside it, declares the plugin's sidebar row embedded, and owns the copy a deployment with the row disabled shows; it does not reimplement the market. The panel is reached through the ledger — the plugin publishes no client service — so the two packages share exactly one string, its `skill-market` panel key, and the panel component must stay prop-free (it is drawn outside its declared seat). A market update ships through that package, and a rename of its panel key is what the bundle acceptance spec (`packages/bundle/web-app/tests/built-in-skill-market.spec.ts`) catches.
- **The MCP connector is the third guest** — the connector catalog, the OAuth/API-key and `mcpServers` authorization, the managed `@deepseek-ai/dsh-mcp-client` entries, the scopes, the governance rules, the tool workbench, and the diagnostics belong to `dsh-mcp-connector`, linked in as the `plugins/dsh-mcp-connector` submodule and mounted by the web-app bundle patch. This page frames the panel page that plugin's Host half serves, declares the plugin's sidebar row embedded, and answers the page's two host questions (the Workspace scope and the example-Prompt conversation); it reimplements none of the connector. The two packages share four strings — the `mcp-connector` panel key, the `/mcp-connector/ui/` page path, and the request/answer message names — and the bundle acceptance spec (`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts`) pins all of them against the shipped artifacts. A connector update ships through that package.
- **The expert market is the first-party guest** — the 331-expert roster, the expert teams, the create-with-AI flows and the enable/disable management belong to `@deepseek-ai/dsh-client-ui-sdkwork-experts`, a package of this repository mounted by the web-app patch (its roster, categories and teams are initialized from `sdkwork-specs` and owned by `sdkwork-agents`). This page supplies the Experts tab's market chip, draws that package's registered panel inside it, declares its sidebar row embedded, and owns the copy a deployment without the row shows; it does not reimplement the market. The panel is drawn with the props its registration injects — the package's own translator, remote client and selection callbacks — because its registration was written for the `main` seat and a bare render of it throws; `mainPanelWatch` resolves that face once per registration, and the Experts tab passes it (the Skills surface spreads whatever its registration injects for the same reason). The package registers its `main` panel only while its own entry is enabled, which is why the web-app row pins `entryLocation: both`: a deployment that disables the row, or a person who switches that entry to settings-only, gets the chip's unavailable notice instead of a dead frame. The panel key (`agency-agents`) is the one string the two packages share, and `packages/bundle/web-app/tests/built-in-expert-market.spec.ts` pins it together with the two composed rows and the built artifacts. The page also owns the catalog data-plane trigger: once the SDKWork gateway and IAM session are ready it reads the 331 experts, the five teams and both persona locales from the Agents App API (`GET /app/v3/api/ai/experts`, `/expert_teams`, `/expert_personas`) and pushes them into the plugin's `agencyAgents` Remote overlay; a failed or absent sync leaves the plugin on its bundled roster.
- **Upstream's page is the fallback, never a companion** — a fork composition hides `ui-plugin-manager` while this row runs and brings it back when this row is switched off, so the plugin surface can never render twice; enabling both by hand is a load failure by design, not a duplicate page.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The prompt dispatch serves plugin creation and guided skill actions. It calls `ctx.layout.setMode('code')`, starts a session through the workspaces runtime face, waits for that session to become current, and sends the composed prompt as a queued text turn.

The plugin-source form and SDKWork Marketplace share `@deepseek-ai/dsh-plugin-manager/source` validation. The generated Plugins App SDK supplies catalog records; the host adapter converts each Git or Drive artifact descriptor into an install spec and runs it through the same store and install dialog as manual source installs. Drive file records carry a SHA-256 checksum that the archive installer verifies.

The remote-expert create flow runs through `expertsHost.tsx`, the session/port adaptation template every SDKWork surface package owns: it binds the Agents, Memory, Voice, Skills, Knowledgebase, and Drive generated clients to the active gateway and IAM session (a request fired while signed out is held at the sign-in gate), re-derives them on environment changes, and reports gateway readiness to the create affordance. The capability package's create surface (basic-info dialog and editor) loads code-split on first use, and the knowledge-selection adapter is bound when that surface loads because its state lives in the capability package's own module registry.

The Connectors tab's frame protocol is the connector plugin's, not this package's: the page asks its parent for the Workspace scope (`mcp-connector:workspace-context-request`, answered on load and on request) and asks it to open an example Prompt in a conversation (`mcp-connector:start-session`, answered with `mcp-connector:start-session-result`). `mcpConnectorPanel.ts` owns those names and the panel key, `connectorBridge.ts` maps this application's Workspace/Session snapshots onto the scope — the current Session's Workspace, else the most recently used one, else the only listed one — and delegates the hand-off to `uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'replace' })`, read per hand-off so a row that activates later still counts; no Session is created here. `McpConnectorSurface.tsx` accepts both requests only from its own iframe on this application's origin. The connector's `main` registration is what makes the tab show the panel at all: the same `main`-ledger watch the skill market uses (`mainPanelWatch.ts`), which is why neither panel needs a client service from its package.

The framed page ships its own indigo accent family, and this repository does not edit that package, so the frame's owner carries the theme: `connectorTheme.ts` appends one style element to the panel document on each load, re-pointing `--accent`, `--accent-hover` and `--accent-light` at the host brand ramp (hover step 600 on a light panel, 400 on a dark one, `--accent-light` mixed against the panel's own `--card`). Status colours, neutrals and ink stay the panel's. Those three variable names are a soft contract with the shipped artifact, pinned by the bundle acceptance spec beside the panel key and the frame protocol.

</details>
