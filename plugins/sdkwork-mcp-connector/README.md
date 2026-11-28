---
description: "The SDKWork MCP connector: the connector market served by the sdkwork-mcp application, local connection records, OAuth/API-key authorization, connection scopes, tool governance, the cross-connection tool workbench, and connection diagnostics."
kind: "plugin-reference"
---

# @sdkwork/dsh-mcp-connector

English | [中文](README.zh.md)

## Summary

The SDKWork MCP connector brings MCP server setup, authorization, cross-connection tool search and connection troubleshooting into one surface. It is a **first-party plugin of this repository** — it lives in `plugins/sdkwork-mcp-connector` and ships committed `lib/` and `ui/` artifacts, the same way the other in-tree plugins ship — and the web-app bundle mounts it by default as the `sdkwork-mcp-connector` row, so a shipped build and the desktop layer patched over it offer the surface with no installer step.

One row carries both halves:

- the **Host half** (`lib/index.js`) owns the local connection records, the OAuth 2.0 PKCE grants and API-key credentials, the connection scopes, the three-level governance rules, and the managed `@deepseek-ai/dsh-mcp-client` loader entries a live connection becomes. The Host's own MCP client still owns the transport, the stdio subprocess, tool registration, execution and the approval chain. The Host half also serves the whole connector interface as a same-origin page at `/mcp-connector/ui/`.
- the **browser half** (`lib/client.js`) registers the keyed `mcp-connector` main panel plus its sidebar row, and that panel draws the served page in an iframe.

The market itself is **not bundled with the plugin**. The connector catalog lives in the `sdkwork-mcp` application's database (`ai_mcp_catalog_entry`, `ai_mcp_catalog_server`, `ai_mcp_catalog_prompt`) and is read through that application's generated App SDK (`@sdkwork/mcp-app-sdk`, `lib/sdkwork-catalog.js`). The plugin therefore ships no `catalog/` directory and no CDN fallback: a deployment's connector shelf is whatever its `sdkwork-mcp` service publishes.

## Table of Contents

- [Summary](#summary)
- [Cloud catalog](#cloud-catalog)
- [Runtime requirements](#runtime-requirements)
- [Panel integration](#panel-integration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Fork provenance](#fork-provenance)

<a id="cloud-catalog"></a>
## Cloud catalog

`lib/sdkwork-catalog.js` resolves the deployment environment in this order and reads the catalog from the first source that yields a gateway:

1. the plugin's own `catalogApiBaseUrl` / `catalogAccessToken` config (ops and tests only),
2. the `ui-sdkwork-env` settings section's active environment profile (`apiBaseUrl`, `accessToken`),
3. the SDKWork host environment variables (`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` and friends, `SDKWORK_ACCESS_TOKEN`).

It then calls `mcp.listCatalogEntries` through the generated SDK, paginates to the end, maps every record onto a connector descriptor (`entry_key` → `id`, `auth` verbatim, `servers[]`, `prompts[]`), and hands the result to the same audit and merge pipeline the bundled catalog used to feed. Local on/off overrides, config-injected descriptors and locally installed descriptors keep their precedence, and the last successful catalog is cached in the plugin's storage domain, keyed by the gateway that produced it, so a restart renders the shelf before the network answers.

The sharing feature's trust root follows the cloud catalog too: a shareable connection template may only reference a published entry the running deployment actually serves.

<a id="runtime-requirements"></a>
## Runtime requirements

The row activates in a profile that provides `tools`, `storageDomain`, `loader` and `workspaceRegistry`; the panel page exists only where the Host also serves `ctx.webServer`, so a pure-conversation deployment keeps the tools but has no page to frame. The Host half reads the optional `settings` service (`ctx.get('settings')`) for the deployment environment, and never requires it.

`pnpm install` links the workspace's own `@deepseek-ai/dsh-mcp-client`, `@deepseek-ai/dsh-storage-domain`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` and the sibling checkout's `@sdkwork/mcp-app-sdk`, and installs the plugin's three runtime dependencies (`cross-spawn`, `undici`, `zod`). Browsing the market needs network access to the deployment's `sdkwork-mcp` service; connecting needs whatever the chosen provider requires, and its credentials never leave this machine.

<a id="panel-integration"></a>
## Panel integration

The Connectors tab of `ui-sdkwork-markets` is this plugin's panel page and nothing else: the page frames `/mcp-connector/ui/`, declares the plugin's sidebar row embedded, and answers the two messages the page asks its host frame for — the Workspace scope a new connection defaults to, and the conversation an example Prompt opens. The strings the two packages share (the `mcp-connector` panel key, the `/mcp-connector/ui/` page path, and the frame's message names) live in `packages/client/ui-sdkwork-markets/src/client/mcpConnectorPanel.ts`; `packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` fails if the shipped artifacts stop declaring any of them, and also fails if a bundled catalog ever comes back.

**Toolbar.** The page draws its own toolbar (view switch, search, add, refresh, language, quick start) when it is opened stand-alone. Framed by the Connectors tab, the application header owns those controls — the Skills tab's arrangement — so the page hides `.toolbar` on the `mcp-connector:host-toolbar` command and accepts `host-view`, `host-search`, `host-add`, `host-refresh` and `host-locale`, reporting its view and counts back with `host-state`. The tab therefore shows one row of chrome and the panel keeps only the category rail.

**Theme.** The page's stylesheet is token-first and flat: no card stroke, no card shadow, fill-only hover states, and every surface, ink, accent, radius and elevation reads a `--dsw-*` alias with a `light-dark()` fallback so the page also works opened on its own. Framed by the application, `ui-sdkwork-markets`' `connectorTheme.ts` projects the host's computed alias values and its resolved `color-scheme` into this document on every load and theme change, so the panel follows the running theme (including an OEM brand) instead of the operating system's preference.

<a id="model-experience"></a>
## Model Experience

The plugin reserves the `mcp_connector_*` tool family: the catalog browser, connection setup, credential configuration, JSON import, redacted export, snapshot/restore, URL install, status, enable/disable, disconnect, catalog refresh and local publish/unpublish. Each tool description names the connector vocabulary the model needs and nothing about the Host or the transport. With `compactManagementTools: true` the family shrinks to the discovery and session entries.

#### KV Cache effect

None beyond the tool definitions themselves. The catalog is data the tools read on demand; it contributes no prompt section and no session event.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **The market is only as available as the deployment's MCP service.** With no gateway configured the catalog is empty and the panel states the failure; there is no bundled fallback by design, because a second copy of the same records is exactly the drift this migration removed.
- **A packaged release needs the catalog SDK on the registry.** The packed plugin manifest names `@sdkwork/mcp-app-sdk` at the facade's exact workspace version (currently `0.1.6`, whose `./generated` subpath export and `mcp.listCatalogEntries` operations this plugin imports). `sdkwork-mcp` must publish that version before a release packs this bundle; `release:pack:assistant` already includes the plugin's own tarball.
- **One panel page, one iframe.** The Connectors tab frames a same-origin page rather than re-rendering the connector UI as React components; that keeps every connector feature and its visual design intact at the cost of a second document.
- **Update checks are local facts.** The plugin ships with the application, so the settings version block reports the installed version only and performs no npm or GitHub lookup.
- **Upstream test scaffolding is not carried.** The fork ships `lib/` and `ui/` plus this documentation; the upstream repository's marketing, registry tooling and `node --test` suite are not part of this checkout.

<a id="fork-provenance"></a>
## Fork provenance

The implementation is a fork of [`duhu2000/dsh-mcp-connector`](https://github.com/duhu2000/dsh-mcp-connector) (v0.2.120, MIT — see [LICENSE](LICENSE)), taken in-tree and renamed to carry the `sdkwork` marker. The connector UI, connection model, authorization flows, scopes, governance and diagnostics are that project's work; this repository changed the catalog source (from a bundled JSON plus CDN registry to the `sdkwork-mcp` App SDK), the plugin identity, and the version-status surface (no third-party update polling). The upstream catalog data was imported into `sdkwork-mcp`'s database initialization seeds, so the market no longer depends on the upstream package at runtime.
