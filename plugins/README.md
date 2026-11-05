# Git-linked plugins

Third-party DSH plugins this fork ships **inside the repository** rather than
asking the user to install them. Each entry is a Git submodule that is also a
pnpm workspace member, so `pnpm install` links the plugin and installs its own
runtime dependencies, and a bundle patch can mount it by name like any other
package.

This directory is deliberately neither of the two neighbours it resembles:

| Directory | What it holds | Owned by |
|---|---|---|
| `vendor/` | Source copies of the Cordis framework, rescoped to `@deepseek-ai/*` | This fork (edited here) |
| `packages/` | Packages this repository authors | This fork (edited here) |
| `plugins/` | Whole external plugins, pinned to an upstream commit | The upstream project (never edited here) |

Nothing here is rescoped or edited. A local fix belongs upstream, followed by a
pin bump; the [naming contract](../AGENTS.md#sdkwork-fork-naming-contract)
applies to fork-authored packages, and these keep their upstream names on
purpose so `git submodule update` stays a fast-forward.

`plugins/*` is outside tsdown's build globs (`vendor/*`, `packages/*/*`): each
plugin ships its own build, and its artifacts are committed upstream instead of
being produced by this repository's build.

## dsh-im — IM channels

[`dsh-im`](https://github.com/xmanrui/dsh-im) connects IM robots (Feishu, WeChat,
WeCom, DingTalk, QQ, Slack, Telegram, Discord, WhatsApp, iMessage, Matrix) to
the harness and adds one `设置 → IM机器人` settings page. It is mounted by
`packages/bundle/web-app/cordis.patch.yml` as the `xmanrui-dsh-im` row, which
the desktop layer (`dsh-sdkwork-desktop-app`) inherits, so a shipped build
offers the surface with no installer step.

**Pin.** The gitlink is `d2f2703d`, the upstream `main` tip twelve commits past
`v5.9.1`. A pin has to be a revision where upstream's committed `lib/index.js`
and `lib/client.js` and their sources agree, which matters because this
repository runs those artifacts as shipped rather than rebuilding them. A
release commit is the usual such point; this tip qualifies because every commit
after `v5.9.1` rebuilt the committed `lib/` files with its source changes.

**Update.**

```sh
git submodule update --remote plugins/dsh-im   # follows `branch = main`
pnpm install                                   # relink and refresh the lockfile
pnpm exec vitest run packages/bundle/web-app/tests/built-in-im.spec.ts
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`, and boot
`pnpm dsh web` once to confirm the row still activates and the settings page
still renders. Re-check upstream for a new release before each release of this
fork: nothing here notices one, so an unreviewed pin silently ships the previous
plugin. Prefer a tag over `main` when the new release is available:
`main` carries commits between releases whose built artifacts may lag their
sources (locale JSON is loaded at runtime, so it can legitimately move between
releases; the bundled `lib/*.js` cannot). The current pin is a `main` tip
because the commits after `v5.1.0` did rebuild `lib/client.js`; a later release
tag containing them is still the preferred next pin.

**Dependencies.** `pnpm install` installs the plugin's own dependencies into
`plugins/dsh-im/node_modules`. Most channels are inlined into the committed
`lib/index.js`; the few the plugin loads at runtime (`dingtalk-stream`,
`imapflow`, `nodemailer`, `qrcode`, `undici`, Sharp, the Tencent and WeCom
connectors) resolve from that directory. `@whiskeysockets/baileys` is denied in
`pnpm-workspace.yaml` `allowBuilds` because its build input is already inlined
and its `prepare` script recompiles TypeScript this repository never runs.

**Rebuilding from source** is only needed when working on the plugin itself, not
to ship it:

```sh
pnpm --dir plugins/dsh-im run build   # needs that package's Baileys build approved first
```

**Turning it off.** Disable the row from a later patch layer
(`- id: xmanrui-dsh-im` with `disabled: true`) or delete it from the web-app
patch. The plugin owns no other composition surface, so either form removes the
settings page and every channel with it.

**CI.** Every workflow checkout that installs or builds the workspace uses
`submodules: recursive`; a job that checks out without it finds an empty
`plugins/dsh-im` and fails workspace resolution.

**Windows checkouts.** The submodule carries no `.gitattributes` of its own and
the parent's rules do not reach inside it, so a Windows checkout inherits the
machine's `core.autocrlf` and `bin/dsh-im.mjs` arrives with a CRLF shebang, which
`pnpm pack` refuses with `ERR_PNPM_BIN_CRLF`. The desktop packaging normalizes the
plugin's `bin/*` shebangs before packing it (`normalizePackedPluginShebangs` in
`apps/desktop/scripts/package-target.ts`), so a build needs no manual step; a
`git submodule update` restores the CRLF form and the next packaging run
normalizes it again.

**Verification.** `packages/bundle/web-app/tests/built-in-im.spec.ts` asserts
the composed row, the linked manifest's `dsh.client` web declaration, and both
built entry artifacts, and proves the check rejects each incomplete form
(missing row, disabled row, wrong name, unresolved submodule, lost declaration,
missing artifact).

## dsh-better-sidebar — the right-sidebar workbench and the left-column page model

[`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) is the
open sidebar foundation this fork ships: a plugin contributes a page through a
service (`{ id, title, icon, order }`) and the host draws the row and the page
body. It is **mounted by default** as the `better-sidebar` row in
`packages/bundle/web-app/cordis.patch.yml`, so a shipped build offers its file
tree, Git, changes, tasks, side chat, editor and terminal pages in the right
Sidebar with no installer step. Its host half serves the `/sidebar/*` routes
(file tree, streaming reads, uploads, Git, bundles, side-chat push).

The package's own `dsh.bundle.patch` is deliberately **not** added to the
profile's bundle list: the web-app row is the single mount, so the plugin's
`disabled` double-mount guard never has to reason about a second instance.

The fork's left column (`packages/client/ui-sdkwork-sidebar`) mirrors the same
page model through `ctx.sdkworkSidebar`, and
`packages/client/ui-sdkwork-sidebar/tests/better-sidebar-contract.client.spec.ts`
fails when the submodule's tracked files are modified or when upstream's
`TabDescriptor` stops declaring `id`, `title`, `icon` or `order`.

**Read-only.** Nothing in this repository edits, patches or re-vendors this
submodule; a missing capability is fixed upstream, released and pulled in by
moving the pin ([root rule](../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract)).
The workspace installs it as a member (`plugins/*`), which runs its own
`prepare` build and produces the gitignored `lib/` artifacts the row loads;
`pnpm --dir plugins/dsh-better-sidebar run build` (or the root
`build:better-sidebar` script) rebuilds them from the pinned source.

**Surface overlap.** The fork's right Sidebar already ships its own workspace
file tree, terminal, browser and document-preview tabs, and this plugin adds
its own file tree, Git, changes, tasks, side chat and editor beside them. Both
sets are live by default; a deployment that wants only one side removes the
other's rows rather than editing either package.

**Turning it off.** Disable the row from a later patch layer
(`- id: better-sidebar` with `disabled: true`) or delete it from the web-app
patch. Every page, route and service it owns goes with it; the left column's
`ctx.sdkworkSidebar` registry is independent and keeps working.

**Pin.** The gitlink is `b0e0fab`, the `v0.28.2` release commit (`dev` merged for
the cold-cwd read fix). Unlike `dsh-im`, upstream does not commit `lib/`, so the
pin must be a revision whose tagged source this repository's install builds
successfully — prefer a release tag over a `dev` tip.

**Update.**

```sh
git submodule update --remote plugins/dsh-better-sidebar   # follows `branch = dev`
cd plugins/dsh-better-sidebar && git checkout vX.Y.Z       # prefer a release tag
cd ../.. && pnpm install                                   # relink, rebuild, refresh the lockfile
pnpm exec vitest run packages/client/ui-sdkwork-sidebar/tests packages/bundle/web-app/tests
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`. If the release
renames a descriptor field, update
`packages/client/ui-sdkwork-sidebar/src/client/service.ts` in the same commit —
the contract spec fails until it matches.

## dsh-skill-market — the SkillHub skill market

[`dsh-skill-market`](https://github.com/montersy123/dsh-skill-market) is the
SkillHub market: a full-page panel that browses, searches, installs, updates and
disables the community skills published on `skillhub.cn`, with categories,
detail tabs, a local `.zip` import, favourites, and installed management. It is
**mounted by default** as the `montersy-skill-market` row in
`packages/bundle/web-app/cordis.patch.yml`, so a shipped build — and the
desktop layer patched over it — offers the market with no installer step.

One row carries both halves. The host half registers the same-origin
`/skill-market/api/*` prefix on `ctx.webServer` (SkillHub answers browsers
without CORS, so the page cannot call it directly) and owns installation: it
downloads the skill's whole file bundle, validates every path and byte, writes
it under `$DSH_HOME/skills/<handle>--<slug>/`, and publishes it to `ctx.skills`
as a **live runtime registration**. That last part is the integration with this
harness's skill system rather than with a market of its own: an installed skill
is an ordinary skill the filesystem provider also discovers, so the Skills
settings page lists it, and the running session's model can invoke it without a
process restart. Disabling a skill moves its directory out of the harness skill
root, so the on/off state is the filesystem instead of a flag. The browser half
registers the `skill-market` keyed `main` panel plus its `sidebar.panellist`
row, and binds the DSH locale service (Chinese/English dictionaries follow
设置 → 常规).

**Skills tab integration.** The fork's market page
(`packages/client/ui-sdkwork-markets`) cannot draw another plugin's page, and
this plugin publishes no client service, so the Skills tab integrates by
navigation and by a pinned panel key: its leading `技能市场` chip renders the
market entry surface and hands over through `ctx.layout.selectPanel`, and the
skills add menu carries the same destination. The key (`skill-market`) is the
one soft contract between the two packages — `SKILL_MARKET_PANEL_ID` in
`packages/client/ui-sdkwork-markets/src/client/skillMarketPanel.ts` — and the
acceptance spec fails if the shipped client no longer registers it. While the
panel is not registered — the row is disabled, or the plugin's client half has
not loaded yet — the chip explains that instead of offering a navigation that
would throw.

**Settings management.** An installed skill is listed by the fork's Settings →
技能 page under its own `技能市场` group, with `SkillHub 技能市场` as its source.
The row is classified by provider (`skill-market`) because the Host reports the
market's own `source` string as `unknown` by design; the provider is also the
winning fact, since the runtime registration (rank 250) outranks the
user-level filesystem copy of the same directory (400). The page's enable switch
writes the durable `disabledSkills` suppression, which wins the catalog merge at
rank 0 — so Settings can turn a market skill off without moving a file, while
the market panel's own switch keeps owning the directory. The two switches are
not mirrored; the README of `packages/client/ui-sdkwork-skills` records that
split under its known limitations.

**Pin.** The gitlink is `4cda930`, the `v2.0.7` release commit (also upstream
`main`'s tip at pin time). Like `dsh-im`, upstream commits `lib/`, so this
repository runs the shipped artifacts rather than rebuilding them, and the pin
must be a revision where `lib/` and the sources agree — a release tag is that
point. Prefer a tag over a later `main` tip for exactly that reason.

**Dependencies.** The package declares no runtime dependencies of its own; its
two halves are self-contained ESM and the browser half requires only the
baseline `react` / `@deepseek-ai/dsh-client-ui-primitives` modules. Host side it
needs Node >= 20, `ctx.webServer`, and the optional `ctx.skills` service (a
profile without the skill registry still serves market data and installs to
disk, it just has no catalog to publish into). Browsing and installing need
network access to `api.skillhub.cn`; enable, disable and uninstall do not.

**Update.**

```sh
git submodule update --remote plugins/dsh-skill-market   # follows `branch = main`
cd plugins/dsh-skill-market && git checkout vX.Y.Z       # prefer a release tag
cd ../.. && pnpm install                                 # relink and refresh the lockfile
pnpm exec vitest run packages/bundle/web-app/tests/built-in-skill-market.spec.ts
pnpm exec vitest run packages/client/ui-sdkwork-markets/tests
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`. If a release
renames the panel key, update `SKILL_MARKET_PANEL_ID` in the same commit — the
acceptance spec fails until it matches. Re-check upstream for a new release
before each release of this fork: nothing here notices one, so an unreviewed pin
silently ships the previous market.

**Verification.**
`packages/bundle/web-app/tests/built-in-skill-market.spec.ts` asserts the
composed row, the linked manifest's `dsh.client` web declaration and
`dsh.bundle.patch`, both built entry artifacts, the host half's `webServer`
injection and `ctx.skills` publication, and the client's `skill-market` panel
and sidebar registrations, and proves the check rejects each incomplete form.

**Turning it off.** Disable the row from a later patch layer
(`- id: montersy-skill-market` with `disabled: true`) or delete it from the
web-app patch. The market page, its routes, and its entry points go with it;
already-installed skills stay — they are ordinary files under
`$DSH_HOME/skills`, and the filesystem provider keeps serving them. The
Skills tab's market chip explains the disabled state rather than breaking.

## dsh-mcp-connector — the MCP connector market, connections and tool workbench

[`dsh-mcp-connector`](https://github.com/duhu2000/dsh-mcp-connector) brings MCP
server setup, authorization, cross-connection tool search and connection
troubleshooting into one surface: a continuously updated catalog of connectors
(the public registry plus the cards bundled with the package), the connection
records and their OAuth 2.0 PKCE / API-key / `mcpServers`-JSON authorization,
the tool workbench with per-connector diagnostics, connection scopes
(project/global), three-level governance rules, and session-scoped tool
injection. It is **mounted by default** as the `duhu2000-mcp-connector` row in
`packages/bundle/web-app/cordis.patch.yml`, so a shipped build — and the desktop
layer patched over it — offers the surface with no installer step.

One row carries both halves. The host half owns the catalog, the connection
records and OAuth grants (its own storage domain plus
`$DSH_HOME/storages/mcp_connector_grants_v1`), the scopes and governance rules,
and the managed `@deepseek-ai/dsh-mcp-client` loader entries a live connection
becomes — the Host's own MCP client still owns the transport, the stdio
subprocess, tool registration, execution and the approval chain. It also serves
the whole connector interface as a same-origin page at `/mcp-connector/ui/`,
whose CSP `frame-ancestors` follows the plugin's `frameAncestors` config
(`['self']` by default). The browser half registers the `mcp-connector` main
panel plus its sidebar row, and the panel draws that page in an iframe.

**Connectors tab integration.** The fork's market page
(`packages/client/ui-sdkwork-markets`) embeds the connector as its Connectors
tab: the tab frames the plugin's panel page and answers the two messages that
page asks its host frame for — the Workspace scope a new connection defaults to,
and the conversation an example Prompt opens (through the Workspace surface's
own `uiWorkspace.startSession`) — and it declares the plugin's sidebar row
embedded through `ctx.sdkworkSidebar`, so the connector keeps one navigation
entry. The strings the two packages share (the `mcp-connector` panel key, the
`/mcp-connector/ui/` page path, and the frame's message names) live in
`packages/client/ui-sdkwork-markets/src/client/mcpConnectorPanel.ts`;
`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` fails if the
shipped artifacts stop declaring any of them.

**Pin.** The gitlink is `2057af5`, the `v0.2.94` release commit (also upstream
`main`'s tip at pin time). Like `dsh-im` and `dsh-skill-market`, upstream commits
`lib/`, so this repository runs the shipped artifacts rather than rebuilding
them, and the pin must be a revision where `lib/`, `ui/` and the sources agree —
a release tag is that point. Prefer a tag over a later `main` tip for exactly
that reason.

**Dependencies.** `pnpm install` links the workspace's own
`@deepseek-ai/dsh-mcp-client`, `@deepseek-ai/dsh-storage-domain`,
`@deepseek-ai/schemastery` and `@deepseek-ai/cordis` into
`plugins/dsh-mcp-connector/node_modules`, and installs its three runtime
dependencies (`cross-spawn`, `undici`, `zod`). Browsing the catalog needs
network access to the registry the row's `catalogUrl` names; a deployment that
wants the bundled cards only sets `catalogUrl: ''`. Connecting needs whatever
the chosen provider requires, and its credentials never leave this machine.
The row activates only in a profile that provides `tools`, `storageDomain`,
`loader` and `workspaceRegistry`; the panel page exists only where the Host also
serves `ctx.webServer`, so a pure-conversation deployment keeps the tools but
has no page to frame.

**Update.**

```sh
git submodule update --remote plugins/dsh-mcp-connector   # follows `branch = main`
cd plugins/dsh-mcp-connector && git checkout vX.Y.Z       # prefer a release tag
cd ../.. && pnpm install                                  # relink and refresh the lockfile
pnpm exec vitest run packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts
pnpm exec vitest run packages/client/ui-sdkwork-markets/tests
pnpm exec vitest run packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`, and boot
`pnpm dsh web` once to confirm the row activates, `/mcp-connector/ui/` answers,
and the Connectors tab frames it. Re-check upstream for a new release before
each release of this fork: nothing here notices one, so an unreviewed pin
silently ships the previous connector.

**Verification.** `packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts`
asserts the composed row, the linked manifest's `dsh.client` web declaration and
`dsh.bundle.patch`, all four shipped files (both entry artifacts, the route
module and the panel page), the client's `mcp-connector` main-panel
registration, the host half's four injected services and its
`/mcp-connector/ui` route, and the frame protocol in both halves, and proves the
check rejects each incomplete form.

**Turning it off.** Disable the row from a later patch layer
(`- id: duhu2000-mcp-connector` with `disabled: true`) or delete it from the
web-app patch. The connector market, its routes, the managed mcp-client entries
and the panel page go with it, so the Connectors tab states that the connector is
unavailable instead of framing a missing route. Existing connection records stay
on disk under `$DSH_HOME`, and the `mcp`-prefixed loader entries the row created
disappear with the row's composition. The plugin's own `showSidebarEntry`
config is unrelated to this page: the tab embeds the panel and suppresses the
row, so the row's stand-alone page is not a second entry either way.
