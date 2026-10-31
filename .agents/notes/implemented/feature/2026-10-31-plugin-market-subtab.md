# Agent Note: The Plugin Market inside the Plugins tab

Status: implemented

English | [中文](2026-10-31-plugin-market-subtab.zh.md)

## Problem

The fork's `markets` mode page replaced upstream's Plugins page (see [the replacement rule](../architecture/2026-09-06-sdkwork-markets-public-mode.md)), so the page a person reaches from the sidebar's `插件·专家·技能·链接器` entry has no `plugins.tab` seat. The community plugin market — the `dshmarket` profile plugin — registers itself into exactly that upstream seat (and into Settings), so in this composition it only appeared behind Settings and not on the Plugins surface itself.

The product needs the market to lead the Plugins view: first chip, before the app's own cloud catalog, discoverable even when the market is not installed, and updatable afterwards without this in-box package pinning it.

## Decision

### The leading sub-tab hosts the market's own page

`ui-sdkwork-markets` gains a fourth Plugins sub-tab, `market`, ordered first: `[插件市场 · 云端目录] | [官方插件 · 已安装]`. The existing hairline divider now precedes `official` only, so the two market views read as one group. The Plugin Market is also the **landing view**: opening Plugins lands on the catalog a person came for, and every re-entry (a category switch, an expert view's back control) returns there. The cloud catalog therefore pays no fetch on entry and, by the same token, no longer owns the default surface — the market's mount does fetch the community catalog, which the product accepts as the cost of the headline view.

The panel is not re-drawn here. `dshmarket` already publishes a `market` client service for a host that renders its panel inside its own container (`render({ surface: 'plugins' })`, contract version 1), which is the extension point upstream's own shell added for third-party hosts. This page:

- consumes the service as an **optional** dependency (`ctx.inject(['market'], …)`) and publishes it through a small observable ledger (`marketPanel.ts`), so a plugin that loads after the page mounted still attaches, and one that unloads withdraws its panel;
- renders the returned element in a scroll viewport under the chip row, and while that chip is active drops the page's own search field — the market's page carries its own search, categories, install dialog, updates, backups, and diagnostics, and a second inert search field beside it would read as broken — but keeps the page's **Add menu** (create plugin / add plugin market) in the header, so the page's own creation flow stays reachable instead of disappearing with the tools;
- recognises only contract `version === 1` with a `render` function. A future revision degrades to the affordances below instead of crashing the page.

### Four states, decided by the plugin store

When no control is published, the chip still renders — a market that only exists after installation would otherwise be undiscoverable. The face is chosen from the plugin store's read:

- **loading** — the first inventory read is in flight (the gate owns that read because the market chip can be the first surface a boot shows);
- **error** — the read failed, with a retry;
- **pending** — the bundle is installed but its browser half was not part of this page load, so a reload loads it;
- **disabled** — the bundle is installed but deselected (for example switched off from the installed roster), so a reload would never load it and the person is sent to the switch instead;
- **missing** — an install affordance that runs the same pipeline as the local plugin views (`store.openInstall('dshmarket')` then the store's one Install action), plus a way to the cloud catalog.

A deployment whose store reports no plugin management never sees an enabled install button; it gets the reason instead. The install dialog mounts beside the panel at page level, so progress, log, cancel, and the restart notice survive the panel swap.

### Install and update are the profile plugin's business

The market is a profile bundle, installed through the ordinary plugin pipeline (`dsh plugin --profile <name> add dshmarket`, or the in-app plugin manager), which selects the bundle in `dsh.profile.bundles` and applies its own `cordis.patch.yml`. This package declares no version, no dependency, and no update logic: the market updates itself through its own card and channel, and the in-box page only observes the result. The hosted tab therefore keeps working across market versions.

## Alternatives considered

**A new slot instead of the service.** A `plugins.market` seat would let the page render the market without a service contract, but `dshmarket` does not register into it and a slot with no registrant renders nothing — it would have required a change in the third-party package and a slot no other consumer needs. The service is the contract that package already publishes for hosts like this one.

**Keep the cloud catalog as the landing view.** It preserves the page's previous entry surface and spends no community-catalog fetch on every visit. The product chose the market instead: the tab exists to make the market the first thing a person sees, and a landing view that hides it behind one chip defeats that. The fetch cost is accepted, and the empty/install faces keep that entry useful where the market is not installed.

**Vendor or fork `dshmarket` into this repository.** It would let the fork tweak the panel, and it would stop the market's own update path — the opposite of the requirement. The profile install is what keeps updates flowing.

**Route installs through the upstream page's owner props.** Upstream's `plugins.tab` hands a registrant the host's `install` and `openPackage`; this composition does not declare that slot, and the market deliberately brings its own install UI because routing through the host would drop the market's progress, task list, and cancel.

## Consequences

The page and the market share exactly one contract (the `market` service, version 1) and one fact (whether `dshmarket` is in the store's bundle list). A market release that changes its render contract costs the live panel and falls back to the install/pending faces until this page catches up; a market release that keeps the contract needs no change here. The gate's inventory read runs on entering the chip (the store collapses concurrent reads); because the chip is the landing view, that read now runs on every entry to Plugins, and the market's own catalog fetch runs whenever the live panel mounts.

The market's Settings section and its `plugins.bundle.config` card still render wherever those seats exist, so a deployment that has not yet loaded this page's new bundle can still reach the market through Settings after a reload — the two doors coexist.

## Verification

`pnpm exec vitest run packages/client/ui-sdkwork-markets/tests/markets-page.client.spec.tsx packages/client/ui-sdkwork-markets/tests/market-panel.client.spec.ts` covers the sub-tab order and divider, the live panel's `render` call, the Add menu staying on the Plugin Market with its create-plugin item dispatching, the install affordance's store calls (including the busy state), the pending/reload, disabled and unmanaged faces, the loading and error faces, and the optional service's attach/detach ledger. The client bundle is produced with `pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-markets bundle`.

End to end: a scratch profile with `dshmarket` installed was served by `dsh web` and driven through Chrome DevTools Protocol. The Plugins page shows `插件市场 | 云端目录 | 官方插件 | 已安装`, and selecting the first chip renders the market's own panel — heading `插件市场`, version `v1.73.5`, the 发现/主题/收藏/已安装/已屏蔽/高级/任务 tabs, and a loaded community catalog (`全部 (7.9k)`). No console errors from the integration. The same probe against `dshmarket@1.73.6` — the build installed in the running desktop profile — renders the same panel with `v1.73.6`, and that host answers `/dsh-market/status` with `version` and `installed`. The running desktop app has the market installed as a profile bundle, so the market also appears there once this bundle is rebuilt into the app.
