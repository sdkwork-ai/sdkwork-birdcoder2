# Agent Note: Built-in MCP connector, framed by the Connectors tab

Status: implemented

English | [中文](2026-11-01-built-in-mcp-connector.zh.md)

## Problem

The Markets page's Connectors tab was the last of its four categories with nothing behind it. It drew the SDKWork cloud storefront's MCP catalog — a page with no content in a shipped build — plus an inert "My connectors" button, while the capability a person opens that tab for (connect an MCP server, authorize it, find its tools across connections, diagnose a broken one) lives in `dsh-mcp-connector`, a third-party Harness plugin. Reaching it meant finding the package, running `dsh plugin --profile web add dsh-mcp-connector`, and restarting the host.

The tab also could not simply draw the plugin's panel the way the Skills tab draws the SkillHub market: that panel is an iframe of a page the plugin's Host half serves, and it asks its embedding frame two questions (the Workspace scope, and a conversation for an example Prompt). Rendering the registered component outside its declared seat would leave those questions unanswered.

## Decision

`dsh-mcp-connector` is linked into this repository as the `plugins/dsh-mcp-connector` git submodule, joins the pnpm workspace as a member, and is composed by the Web bundle's own patch. The Connectors tab embeds the panel page that plugin serves, and answers the page's two host questions through a small bridge. Nothing about the plugin is edited here.

### Composition

`packages/bundle/web-app/cordis.patch.yml` carries one row:

```yaml
- id: duhu2000-mcp-connector
  name: 'dsh-mcp-connector'
  config:
    catalogUrl: 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json'
```

That row is the whole host integration surface. The host half injects `tools`, `storageDomain`, `loader` and `workspaceRegistry` — all already provided by the base and Web layers — and owns the connector catalog, the connection records and OAuth grants (its own storage domain plus `$DSH_HOME/storages/mcp_connector_grants_v1`), the scopes, the three-level governance rules, and the managed `@deepseek-ai/dsh-mcp-client` loader entries a live connection becomes. The Host's own MCP client still owns the transport, the stdio subprocess, tool registration, execution and the approval chain; the plugin never bypasses it. The catalog URL is pinned in the row rather than left to the package default, so a shipped build keeps the public registry if that default ever moves.

The plugin serves its whole interface as one same-origin page at `/mcp-connector/ui/`, and its own panel draws that page in an iframe. The browser half registers the `mcp-connector` keyed `main` panel plus a matching `sidebar.panellist` row. `dsh-sdkwork-desktop-app` patches over `dsh-web-app`, so the desktop profile inherits the row.

The plugin's own `dsh.bundle.patch` is deliberately not added to the profile's bundle list: the web-app row is the single mount, so its double-mount guard never reasons about a second instance.

### The Connectors tab embeds the page, not the component

`packages/client/ui-sdkwork-markets` owns the Connectors tab and cannot re-declare another plugin's page: a slot has exactly one declarer, and the layout owns `main`. Reading the registered component off the ledger (the route the Skills tab takes for the SkillHub market) does not work here either — that component reads inject props and a store that only its own registration supplies, so drawing it outside its seat would render it without them, and the plugin's page would get no Workspace scope and no way to open a Prompt.

The tab therefore frames the page the plugin already publishes, exactly as the plugin's own panel does, and speaks the plugin's frame protocol:

- `mcpConnectorPanel.ts` declares the panel key (`mcp-connector`), the page path (`/mcp-connector/ui/`), and the message names; `mainPanelWatch.ts` — extracted from the skill market's source — is the live `main`-ledger read that decides whether the tab frames the page or shows the unavailable notice.
- `connectorBridge.ts` maps this application's Workspace/Session snapshots onto the page's scope shape — the current Session's Workspace, else the most recently used one, else the only listed one, because a fresh deployment has neither a Session nor recency yet — and delegates the Prompt hand-off to `uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'replace' })`, the Workspace surface's own New Session capability. That capability is resolved per hand-off rather than at apply time: it comes from a row that may activate after this page, and an optional capability must not decide whether the page loads. No Session is created here, and a composition without the capability reports the hand-off as unavailable inside the panel instead of doing nothing.
- `McpConnectorSurface.tsx` answers both requests only from its own iframe on this application's origin: the scope describes where a connection lands, and the hand-off opens a conversation, so neither may be driven by another frame or by the application window itself.
- `connectorTheme.ts` re-points the page's own accent family (`--accent`, `--accent-hover`, `--accent-light`) at the host brand ramp when the frame loads. The page ships an indigo palette of its own, and the frame's owner is the only place that can align it without editing the submodule; status colours, neutrals and ink stay the panel's. The tint is mixed against the panel's own `--card`, and the hover step follows the panel's `prefers-color-scheme` media query rather than this page's scheme, because a frame is themed by what it draws.
- The header drops its own search field on this tab, and the tab has no "My connectors" affordance: the panel owns its search and its installed view, so a second entry beside it would be dead chrome.

### One navigation entry

The connector plugin registers its own sidebar row, which would be a second navigation entry to the page this tab already embeds. The markets plugin therefore declares that row embedded in `ctx.sdkworkSidebar` (`suppressPanel('mcp-connector')`) beside the skill market's, as one owned Cordis effect: unloading this page restores the row. The optional `ctx.inject(['sdkworkSidebar'], …)` guard is unchanged, so a bare web shell without the fork column still activates.

The plugin's own `showSidebarEntry` config is not used for this: it is the plugin's preference, while suppression is this page's declaration that it is the panel's navigation. A deployment that turns the plugin's entry back on still gets one entry, because the column omits the row regardless.

### Pin and updates

The gitlink is `0aaf140`, the `v0.2.92` release commit (also upstream `main`'s tip at pin time). Upstream commits its built `lib/`, including the panel page under `ui/`, and this repository runs those artifacts as shipped, so the pin has to be a revision where the sources and the committed build agree; a release tag is that point. `branch = main` is recorded in `.gitmodules` so `git submodule update --remote plugins/dsh-mcp-connector` advances the pin.

### Workspace membership and dependencies

`plugins/*` joins `pnpm-workspace.yaml`, so the plugin links as a workspace member and the bundle's row resolves by package name. Its three runtime dependencies (`cross-spawn`, `undici`, `zod`) install into the plugin's own `node_modules`; its DSH peers resolve to this workspace's packages (`@deepseek-ai/dsh-mcp-client`, `dsh-storage-domain`, `schemastery`, `cordis`). `plugins/*` stays outside tsdown's build globs, so this repository's build acquires no plugin that owns its own build.

### Verification

`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` asserts the composed row (and its pinned catalog URL), the linked manifest's `dsh.client` web declaration and `dsh.bundle.patch`, all four shipped files (both entry artifacts, the route module, the panel page), the client's `mcp-connector` main-panel registration, the host half's four injected services and its `/mcp-connector/ui` route, the frame protocol in both halves, the accent variables the framing page re-points, proves the check rejects each incomplete form, and asserts neither desktop override layer disables or re-points the row.

`packages/client/ui-sdkwork-markets/tests/mcp-connector-panel.client.spec.ts` covers the panel source (live, reference-stable, key-specific, disposed) and pins the panel key, page path and message names; `connector-bridge.client.spec.ts` covers the scope mapping and every refusal of the hand-off; `mcp-connector-surface.client.spec.tsx` covers the frame, the unavailable notice, both answers, the origin/source guards, and the theme projection on load; `connector-theme.client.spec.ts` covers the token read, the generated sheet, and the one owned style element; the page spec covers the tab, the notice a deployment without the row shows, and the absence of the page's own search and my-catalog affordance there. `packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts` asserts the shipped browser row is on the real web profile's roster. `plugins/README.md` records the update procedure.

## Alternatives considered

**Rendering the registered panel component, as the Skills tab does for the SkillHub market** — the component is a wrapper that reads inject props (`startPromptSession`, `workspaceContext`, `workspaceOptions`, `store`) and a presentation mode supplied by its own registration. Drawing it from the page would need those props, and the only way to obtain them is to reimplement the plugin's injection — the component contract this repository is supposed to read, not restate. The page it draws is the same surface without that coupling.

**A per-tab marketplace built on the plugin's HTTP API** — reimplement the catalog grid, the connection forms, the OAuth flow, the tool workbench and the diagnostics inside this repository, calling `/mcp-connector/api`. It duplicates the plugin's whole product surface and drifts from it every release; the plugin's page is already the complete interface.

**Opening the plugin's own panel instead of embedding it** — one button that calls `layout.selectPanel('mcp-connector')`. It is the cheapest wiring, but the tab then contains no connector: the four categories would have three surfaces and one hand-over, and the marketplace page's own navigation model (a tab holds its content) would be broken for the category people open most deliberately.

**Letting the plugin keep its sidebar row beside the tab** — two entries to one page, which is the arrangement the Skills tab already rejected for the market.

**Raising `frameAncestors` or embedding cross-origin** — the page is served same-origin by this Host, and the plugin's default CSP (`frame-ancestors 'self'`) already allows it. A deployment shaping the panel into a different shell origin is the plugin's own documented configuration, not something this page may widen.

## Consequences

A shipped build now offers the whole MCP connector surface in the Connectors tab with no installer step: browse the catalog, connect and authorize a server, search its tools across connections, govern them, and diagnose a broken connection. The four categories are now all real surfaces, three of them other packages' own panels.

The cost is a soft contract with a third-party artifact: one panel key, one page path, four message names, and three accent variable names, checked only by the bundle acceptance spec rather than by types. A rename upstream turns the Connectors tab into a failing spec (or, before it is noticed, a tab that frames nothing or a panel that keeps its own indigo) rather than a type error. The frame also inherits the plugin's own limitations and its language resolution, and an unreviewed pin silently ships the previous connector — the review step lives in `plugins/README.md`, not in a gate.

This note follows the same link-don't-vendor shape as [Built-in SkillHub skill market, linked from the Skills tab](2026-11-01-built-in-skill-market-plugin.md) and [The Skills tab draws the SkillHub market in place](2026-11-01-skills-tab-embeds-skill-market.md), and it extends the latter's `main`-ledger watch to a second panel instead of changing it.
