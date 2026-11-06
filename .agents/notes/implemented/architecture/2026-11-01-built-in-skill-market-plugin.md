# Agent Note: Built-in SkillHub skill market, linked from the Skills tab

Status: implemented

English | [中文](2026-11-01-built-in-skill-market-plugin.zh.md)

## Problem

The Markets page's Skills tab carried only the SDKWork cloud catalog, which in a shipped build is empty until that catalog has content: the page a person opens to find a skill offered nothing installable. SkillHub (`skillhub.cn`) publishes a large community skill library, and `@montersy123/dsh-skill-market` is a third-party Harness plugin that browses, searches and installs from it — but reaching it meant the user finding the package on their own, running `dsh plugin --profile web add @montersy123/dsh-skill-market`, and restarting the host. A shipped build had no such surface until they did.

Making it built-in needs three things at once: the plugin present in a shipped build, enabled without an installer step, and updatable without re-porting somebody else's code on every release. It also needs the fork's own Skills surface to know the market exists, because the market is a full-page panel owned by that plugin and the Skills tab cannot draw it.

## Decision

`@montersy123/dsh-skill-market` is linked into this repository as the `plugins/dsh-skill-market` git submodule, joins the pnpm workspace as a member, and is composed by the Web bundle's own patch. Nothing about it is edited here.

### Composition

`packages/bundle/web-app/cordis.patch.yml` carries one row:

```yaml
- id: montersy-skill-market
  name: '@montersy123/dsh-skill-market'
```

That row is the whole host integration surface. The host half injects `webServer`, registers the same-origin `/skill-market/api/*` prefix (SkillHub answers browsers with no CORS header, so the page cannot call it directly), and owns installation. It optionally injects `skills`: a profile without the skill registry still serves market data and still installs to disk, it just has no catalog to publish into. Neither service is new — the base and Web layers already provide both.

The browser half is an ordinary `dsh.client` bundle: `@deepseek-ai/dsh-client-modules` serves `exports["./client"]` as `/plugins/@montersy123/dsh-skill-market/client.js`, the plugin registers the `skill-market` keyed `main` panel and a matching `sidebar.panellist` row into the fork's sidebar, and it binds the DSH locale service so its Chinese/English dictionaries follow 设置 → 常规. `dsh-sdkwork-desktop-app` patches over `dsh-web-app`, so the desktop profile inherits the row and needs no second declaration.

The plugin's own `dsh.bundle.patch` is deliberately not added to the profile's bundle list: the web-app row is the single mount, so its double-mount guard never has to reason about a second instance.

### The skill-system integration

The market's product value is that an installed skill is an ordinary skill, not a market-owned record. Installation downloads the skill's whole file bundle, validates every path and byte, and writes it under `$DSH_HOME/skills/<handle>--<slug>/` — the harness's own skill root, which `@deepseek-ai/dsh-skill-filesystem` already scans — and then publishes the same definition to `ctx.skills` as a live runtime registration. The registration is the state: enabling and disabling map onto `register`/dispose, and disabling also moves the directory out of the skill root, so the filesystem and the catalogue cannot disagree. The consequence is that the skill list, the model-facing catalogue, and the runtime all see the new skill without a restart, and no second integration step is needed on this side.

### The Skills tab's integration

`packages/client/ui-sdkwork-markets` owns the Skills tab and cannot re-declare another plugin's page: the market registers into the layout's keyed `main` slot, and a slot has exactly one declarer. The market also publishes no client control service (unlike `dshmarket`'s `market` control).

The tab therefore integrates through the one explicit contract the two packages share:

- `skillMarketPanel.ts` declares `SKILL_MARKET_PANEL_ID = 'skill-market'` and a source over the live `main` ledger; the key is the only string the two packages share, and the source publishes the registered panel component.
- The Skills tab is a sub-root, mirroring Plugins: the cloud catalog leads, and the SkillHub market follows on the second chip, rendering that panel in place. (The chip order is superseded by [Every market category lands on its cloud catalog](../feature/2026-11-06-markets-cloud-catalog-first.md).)
- The skills add menu's market row switches back to that chip.
- The panel is drawn only while it is registered; while it is missing — the row is off, or the plugin's client half has not loaded yet — the surface says the market is unavailable and the add menu omits the row.
- Because the tab now owns that market's navigation, the markets plugin declares the plugin's own sidebar row as embedded in `ctx.sdkworkSidebar` (`suppressPanel`), so the catalog keeps one entry.

The tab drew the market as a hand-over when this note was written; [the Skills tab draws the SkillHub market in place](2026-11-01-skills-tab-embeds-skill-market.md) records why that changed and what the embedded rendering depends on.

`packages/client/ui-sdkwork-markets/src/client/skillMarketPanel.ts` is the contract's home; `packages/bundle/web-app/tests/built-in-skill-market.spec.ts` reads the shipped `lib/client.js` and fails if the panel key or its registration moves.

### Settings as the management surface

The market is not the only place a market-installed skill is managed: the Settings → 技能 page lists it and can turn it off. That works because the two halves of the skill system agree on facts rather than on a shared registry entry. The market registers each installed skill as a **runtime** skill (provider `skill-market`, source `skill-market`), and the runtime rank (250) beats the user-level filesystem copy of the same directory (400), so the winning catalog row names the market as its origin. The Host collapses the unknown source string to `unknown` by design, so `ui-sdkwork-skills` classifies the row by **provider** instead: a market-installed skill leads the page in its own group and reads "SkillHub market" as its source. Management is the same durable suppression every other skill uses — the page writes `disabledSkills`, this package's Host half projects the name as a rank-0 candidate, and both catalogs drop it while the file stays put.

The two switches answer different questions and are not mirrored: the market panel's switch moves the installed directory between the skill root and its disabled store, while the Settings switch suppresses the name in the catalog merge. That asymmetry is documented rather than hidden ([Skills settings README](../../../../packages/client/ui-sdkwork-skills/README.md#known-limitations-and-deferred-work)); the merged catalog follows the suppression because its candidate ranks lower. A suppressed skill's catalog row is this package's rank-0 placeholder, so while it is off the row keeps its name and switch (the way back) but not the market's description, provider or group.

### Pin and updates

The gitlink is `4cda930`, the `v2.0.7` release commit (also upstream `main`'s tip at pin time). Upstream commits its built `lib/index.js` and `lib/client.js`, and this repository runs those artifacts as shipped, so the pin has to be a revision where the sources and the committed build agree; a release tag is that point. `branch = main` is recorded in `.gitmodules` so `git submodule update --remote plugins/dsh-skill-market` advances the pin.

### Workspace membership and dependencies

`plugins/*` joins `pnpm-workspace.yaml`, so the plugin links as a workspace member and the bundle's row resolves by package name. The package declares no runtime dependencies of its own; both halves are self-contained ESM, and the browser half requires only baseline modules (`react`, `@deepseek-ai/dsh-client-ui-primitives`). Membership therefore adds no third-party closure to review or disclose. `plugins/*` stays outside tsdown's build globs, so the repository build acquires no plugin that owns its own build.

### Naming

The plugin is neither authored nor customized here: renaming it would break its own build and turn every upstream update into a re-port. It is protected from upstream collisions by its location (upstream has no `plugins/` directory) and by the gitlink, which a merge cannot rewrite into somebody else's version.

### Verification

`packages/bundle/web-app/tests/built-in-skill-market.spec.ts` asserts the composed row, the linked manifest's `dsh.client` web declaration and `dsh.bundle.patch`, both built entry artifacts, the host half's `webServer` injection and `ctx.skills` publication, and the client's `skill-market` panel and sidebar registrations, proves the check rejects each incomplete form, and asserts neither desktop override layer disables or re-points the row. `packages/client/ui-sdkwork-markets/tests/skill-market-panel.client.spec.ts` covers the panel source (live, reference-stable, key-specific, component hand-over, disposed), and the page spec covers the sub-root, the embedded panel, the unavailable state, and the add-menu row. On the management side, `packages/client/ui-sdkwork-skills/tests/skill-market-management.host.spec.ts` drives a real skill registry: a runtime registration under the market's provider is suppressed by a settings commit and restored by the next one, and the Skills page spec covers the market group, the provider-derived source label, and the switch wiring. The whole-composition assembly test (`packages/test-support/client-runtime`) boots the roster with the plugin's browser half in it, and `plugins/README.md` records the update procedure.

## Alternatives considered

**A registry dependency** — `dsh plugin add @montersy123/dsh-skill-market`, from npm. This is the market's own documented install path and the smallest change, but it defeats "shipped build": every deployment would have to run it, and the pin would be a version number rather than a reviewable revision. It is the right path for a *user* who wants the market in a deployment that does not ship it, not for the shipped default.

**Forking or editing the submodule to publish a panel control** — the `dshmarket` integration pattern (`ctx.market.render()`). It requires changing a package this repository keeps read-only and fast-forward-updatable, and every upstream release would become a merge. The panel component already arrives on the `main` ledger, so no control is needed; [the later note](2026-11-01-skills-tab-embeds-skill-market.md) records that route.

**A fork-authored wrapper package that renders the market's UI** — duplicates the entire market surface (catalog, detail drawer, install pipeline) inside this repository, and drifts from upstream on every release. Rejected for the same reason the market is not vendored.

**Letting the markets page re-declare the `main` slot** — technically possible, but a slot has exactly one declarer and the layout already owns `main`; a second children table is a load failure by design. The keyed panel is also the identity the sidebar row navigates by, so re-hosting it would detach the market from its own entry.

**A dedicated mode or rail entry for the market** — the plugin already registers its own sidebar row, so an extra mode would duplicate the navigation and split the product's skill surfaces further. The Skills tab's chip is the discoverable entry where people look for skills.

## Consequences

A shipped build now offers a populated skill market on the Skills tab with no installer step, and an upstream release becomes a pin bump plus a lockfile refresh. Installed skills are ordinary files under `$DSH_HOME/skills`, so disabling or removing the plugin row leaves them working; browser and install require network access to `skillhub.cn`, enable/disable/uninstall do not.

The cost is a hard-coded panel key in this repository coupled to a third-party artifact. It is a soft contract, checked only by the bundle acceptance spec rather than by types, and a rename upstream turns the Skills tab's market surface into a failing spec until `SKILL_MARKET_PANEL_ID` moves. The pin is manual: nothing here notices an upstream release, and a stale pin silently ships an old market — the fix is the review step in `plugins/README.md`, not a gate.

The Skills tab's chapter of the markets page is the market itself: the tab draws the panel the plugin registered, so the catalog has one entry and no navigation step. That supersedes this note's hand-over; [the embedding note](2026-11-01-skills-tab-embeds-skill-market.md) records what the in-place rendering depends on (a prop-free panel and a row-suppression declaration) and the manual check that covers the former.

This decision partially supersedes the original Markets page design in [Markets mode page gains the Plugins tab and conversation-executed add flows](../feature/2026-09-07-markets-mode-plugin-plugins-tab-and-add-flows.md): the Skills tab is now a sub-root, where that note described a single-view tab. It follows the same link-don't-vendor shape as [Built-in IM channels from a git-linked third-party plugin](2026-10-09-built-in-im-plugin-via-git-submodule.md).
