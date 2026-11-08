# Agent Note: Built-in usage billing dashboard, linked from a git submodule

Status: implemented

English | [中文](2026-11-08-built-in-usage-billing-plugin.zh.md)

> **Partially superseded on 2026-11-08.** The plugin is now a fork-owned submodule (`sdkwork-ai/sdkwork-dsh-usage-billing`) that this fork edits: the sidebar cost card is hidden by default and drawn in the settings menu under the account identity row. The row, composition, module table, workspace membership, and pinned-artifacts reasoning below still stand; the read-only ownership and the "nothing is edited here" decision do not. See [Fork the usage billing plugin and move its card into the settings menu](2026-11-08-forked-usage-billing-settings-card.md).

## Problem

The harness records everything the dashboard needs — every model call, with token counts, cache hits, tier and route, persisted in the session log — and kept none of it in front of the user. What a build showed was the context meter of the current session; what a person spending money wants is the bill: today, this week, this month, per provider, per model, per session, at peak and off-peak rates.

`@kenz1117/dsh-ui-usage-billing` is a third-party plugin that builds exactly that from the persisted logs: a sidebar cost card, a full dashboard, provider balances and subscription quotas, a low-peak task queue, CSV/JSON export, and a priced catalogue kept current from `models.dev`. Reaching it meant finding the package, running `dsh plugin --profile web add @kenz1117/dsh-ui-usage-billing`, and restarting the host. A shipped build had no such surface until someone did.

Making it built-in needs three things at once: the plugin present in a shipped build, enabled without an installer step, and updatable without re-porting somebody else's code on every release.

## Decision

`@kenz1117/dsh-ui-usage-billing` is linked into this repository as the `plugins/dsh-ui-usage-billing` git submodule, joins the pnpm workspace as a member, and is composed by the Web bundle's own patch. The original integration edited nothing here. Since 2026-11-08 the submodule's repository is the fork's own `sdkwork-ai/sdkwork-dsh-usage-billing`, so fork changes to the plugin are made and built there rather than as local edits in this checkout ([fork note](2026-11-08-forked-usage-billing-settings-card.md)).

### Composition

`packages/bundle/web-app/cordis.patch.yml` carries one row:

```yaml
- id: ui-usage-billing
  name: '@kenz1117/dsh-ui-usage-billing'
```

That row is the whole integration surface, and it carries both halves.

The host half registers its routes on `ctx.webServer` under the same-origin `/api/billing/` prefix — usage aggregated from the persisted session logs, balances, subscriptions, relay quotas, pricing, the task queue, notification claims — and injects `sessionPersistence`, `credentials` and `settings`, all of which the base and Web layers already provide. Its model-facing `usage_stats` tool is declared but registered only after the user turns it on, so the default composition adds no tool to a preset's catalogue and no prompt section.

The browser half is an ordinary `dsh.client` bundle (`platform: 'web'`, with load-order edges on `@deepseek-ai/dsh-client-locale` and `@deepseek-ai/dsh-client-ui-conversation`): it registers the cost card into the fork sidebar's `sidebar.footer.action` seat, a `settings.section` page as the recovery entry after the card is hidden, the composer cost chips into `conversation.composer.dock` / `conversation.input.*`, and the `/usage` command. Every one of those seats is declared by the fork's own host packages — `ui-sdkwork-sidebar` for `sidebar.footer.action`, `ui-sdkwork-settings-menu` for `settings.section`, `ui-conversation` for the composer seats — so the fork's row replacements are exactly what the plugin registers into; `ctx.slots.inject` skips a seat the host does not declare, so the surfaces degrade one at a time rather than failing the plugin.

The package's own `dsh.bundle.patch` inserts this same `ui-usage-billing` row. It is deliberately NOT added to the profile's bundle list: the web-app row is the single mount. `dsh-sdkwork-desktop-app` patches over `dsh-web-app`, so the desktop profile inherits the row and needs no second declaration.

### The module table

The browser half follows the out-of-tree client-bundle protocol this repository already mounts other third-party plugins with: `window.__ModuleLoader__.load({ id, factory })`, with the platform seed externalized through the injected `require` and everything else inlined. It externalizes `react`, `react-dom`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives` and `@deepseek-ai/dsh-client-store` — all five keys of the page's frozen module table, which this fork's seed declares.

The assembled-client tier imports each roster row's `/client` artifact in-process, and its require table listed only four of those keys. `packages/test-support/client-runtime/src/assembly/modules.ts` now lists `@deepseek-ai/dsh-client-store` alongside them, which is the honest fix: the store handle a plugin gets must be the host's class instance, not a second inlined copy. A future third-party bundle that needs one more seed key fails that suite with the specifier named.

### Pin and updates

The gitlink is `9cba33d`, the fork's `1.8.4-sdkwork.3` commit (built from the `v1.8.3-alpha.4` base plus the default-hidden card and the settings-menu account card). The fork commits its built `lib/index.js`, `lib/client.js`, `lib/invariant.js` and the `lib/types` declarations, and this repository runs those artifacts as shipped, so the pin has to be a revision where the sources and the committed build agree. `branch = main` is recorded in `.gitmodules` so `git submodule update --remote plugins/dsh-ui-usage-billing` advances the pin.

The plugin declares `dsh.compatibility` for every host release through `0.2.2-rc.1`, which is this fork's version, and its `devDependencies` pin the `@deepseek-ai/dsh-*` packages to that exact version — the same constraint the other built-in plugins carry, and the reason a release of this fork cannot move its own version line without those pins moving with it.

### Workspace membership and dependencies

`plugins/*` joins `pnpm-workspace.yaml`, so the package links as a workspace member and the bundle's row resolves it by name. Installing it links the host-half peers (this repository's `@deepseek-ai/dsh-*` packages) into `plugins/dsh-ui-usage-billing/node_modules` and installs its one runtime dependency, `clsx`, which the browser bundle then inlines.

Membership also materializes the package's own developer closure (`tsdown`, `vitest`, `@playwright/test`, `shiki`, `katex`, and the rest). That is the cost of shipping it as a member rather than a rebuild-from-source plugin, and it is why moving this pin refreshes `pnpm-lock.yaml`: the lockfile records that closure, and the release of this fork re-installs it.

`plugins/*` stays outside tsdown's build globs (`vendor/*`, `packages/*/*`), so the repository build acquires no plugin that owns its own build.

### Naming

The plugin is neither authored nor customized here: renaming it would break its own build and turn every upstream update into a re-port. It is protected from upstream collisions by its location (upstream has no `plugins/` directory) and by the gitlink, which a merge cannot rewrite into somebody else's version. The loader row keeps the id the plugin's own bundle patch uses (`ui-usage-billing`) so a profile that installs the package from npm and a shipped build name the same entry. Since 2026-11-08 the repository is fork-owned while the package name and row id stay unchanged ([fork note](2026-11-08-forked-usage-billing-settings-card.md)).

### Verification

`packages/bundle/web-app/tests/built-in-usage-billing.spec.ts` asserts the composed row, the linked manifest's `dsh.client` web declaration and `dsh.bundle.patch`, both built entry artifacts, the host half's four injected services and its `/api/billing/usage-stats` route, the client half's `sidebar.footer.action`, `settings.section` and `settings.menu.account` registrations, and that neither desktop override layer disables or re-points the row, and proves the check rejects each incomplete form. `packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts` asserts the roster row and that its declared `inject` edges resolve (both targets are roster rows, so the dangling-edge list does not grow); `assembly-test-client.client.spec.ts` boots the whole web roster with the shipped client bundle materialized against the in-process module table. `plugins/README.md` records the update procedure.

## Alternatives considered

**A registry dependency** — `dsh plugin add @kenz1117/dsh-ui-usage-billing`, from npm. This is the plugin's own documented install path and the smallest change, but it defeats "shipped build": every deployment would have to run it, and the pin would be a version number rather than a reviewable revision. It remains the right path for a *user* who wants the dashboard in a deployment that does not ship it.

**Adding the plugin's own `dsh.bundle.patch` to the profile's bundle list** — the row would arrive without being restated here, but then this repository would ship a composition it does not read: a plugin that later inserts a second row, or removes this one, would change what people get without any diff here. The row in the Web patch keeps one visible mount, matching how the IM, skill-market and MCP connectors are mounted.

**Forking or editing the submodule to attach the dashboard to a fork-owned surface** — every upstream release would become a merge, and the plugin already registers into the seats this fork's hosts declare. Rejected here; reversed on 2026-11-08, when the fork needed product defaults the plugin itself owns and a card inside the settings menu ([fork note](2026-11-08-forked-usage-billing-settings-card.md)).

**A fork-authored wrapper package that re-renders the dashboard** — duplicates an entire surface (aggregation, pricing, quotas, task queue, export) inside this repository and drifts from upstream on every release.

## Consequences

A shipped build now offers a usage/cost dashboard with no installer step, and an upstream release becomes a pin bump plus a lockfile refresh. The ledger, snapshot, reconcile and task-queue files land under `$DSH_HOME`, so removing the row leaves them on disk untouched and reinstalling reads them again.

The cost is one more third-party closure in the workspace install and one more artifact set this repository runs as shipped rather than builds. The pin is manual: nothing here notices an upstream release, and a stale pin silently ships an old dashboard — the review step in `plugins/README.md` is what catches it. The client half's dependence on the frozen seed is now recorded in two places (the plugin's own build preset and this repository's in-process require table), which is a soft contract: a new externalized module fails the assembled-client suite instead of degrading in the browser.
