# Agent Note: Fork the usage billing plugin and move its card into the settings menu

Status: implemented

English | [中文](2026-11-08-forked-usage-billing-settings-card.zh.md)

Partially supersedes [Built-in usage billing dashboard, linked from a git submodule](2026-11-08-built-in-usage-billing-plugin.md): the row, the composition, and the module table stand; the read-only ownership does not.

## Problem

The built-in usage/cost dashboard arrived as a read-only third-party submodule: one bundle row, no source edits, upstream releases pulled in by moving the gitlink ([previous note](2026-11-08-built-in-usage-billing-plugin.md)). That acquired the surface, not the product.

Two product decisions cannot be expressed from outside the plugin:

- **The sidebar card should not be there by default.** The sidebar footer is the fork's own navigation column; a permanently visible spend card competes with it, and the fork already had to invent a hidden mode plus a recovery entry for users who wanted the column back.
- **The card belongs under the account identity in the settings menu.** Opening the gear is the moment a person asks "what have I spent"; the answer should be the first thing the menu says, right under the user name, and clicking it should open the full dashboard.

By default the card is visible (`mode: 'full'`) and lives only in the sidebar. Hiding it made the settings section the only entry, which answers the question one click too deep. Both fixes live in the plugin's client half, so they require editing the plugin — exactly what the read-only submodule contract forbade.

## Decision

### The repository is fork-owned

`plugins/dsh-ui-usage-billing` now points at `sdkwork-ai/sdkwork-dsh-usage-billing`, forked from `kenz1117/dsh-ui-usage-billing` at `v1.8.3-alpha.4`. That fork is the authority for the plugin's source, committed `lib/` build, and product defaults; this repository pins it by gitlink as before. [AGENTS.md](../../../../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract) and plugins/README.md now state the exception: only a submodule whose `url` is an SDKWork repository may be edited in place, and only this entry qualifies today.

The npm package name (`@kenz1117/dsh-ui-usage-billing`) and the loader row id (`ui-usage-billing`) stay unchanged. Renaming either would churn the bundle composition, the plugin's own build, and every reference for no user-visible gain; the fork's identity lives in the repository, its README notice, and its changelog.

### Default: the sidebar card is hidden

`DEFAULT_BILLING_CARD_PREFS.mode` is now `'hidden'` instead of `'full'`. Reading is fail-closed: only a stored `mode` of `full` or `compact` shows the card, so a preference object written before the fork (which has no `mode` field, or an invalid one) resolves to hidden instead of reviving the old visible default. The plugin's own Settings page still offers full / compact / hidden with the hidden mode's recovery-entry guard (`resolveBillingCardMode`). The hidden-mode hint copy now points at the settings menu instead of only at the native Settings page.

### Default: the composer footer chips are hidden

The composer footer carried two billing capsules by default: 低谷队列 (the off-peak queue entry and its enqueue controls) on the left, 价格 (the live cost capsule) on the right. Both are now off for a fresh install (`DEFAULT_QUICK_QUEUE_PREFS.showEntry`, `DEFAULT_LIVE_COST_BAR_PREFS.show`) for the same reason as the sidebar card: the writing surface should not carry billing chrome unless the user asks for it.

The switches also moved. They used to sit in the settings page's three-column "feature switches" grid next to the model-tool and relay-list toggles, which made a composer preference look like an analytics preference. The settings center now opens on a dedicated group — 「输入框底部内容」, the first nav row and first card — holding both switches in one card: 低谷队列 and 价格, each with its own line of copy. The price switch expands the position control (inside / above / below the composer) only while it is on, so a closed switch does not leave a meaningless choice below it.

Changing a default is not enough for these two fields, which is why the fix is not just the constant. Older builds treated "shown" as the default, and any preference write at all — clicking the queue switch, changing the float window's position — persisted that `show: true` / `showEntry: true` into `localStorage`. A user upgrading with such a record would keep seeing the capsules the change exists to remove (the reported symptom). Reading is now opt-in — only an explicit `true` shows a capsule — and the client runs a one-time migration (`dsh.ui-usage-billing.composer-footer-hidden`) that writes both display fields off once per browser while preserving the position, queue-enable, draft-clear, and source-session fields. A switch the user turns on afterwards is stored and respected; the migration marker keeps it from running twice.

### The card in the settings menu is a seat, not a menu feature

The settings menu is the fork's own shell (`ui-sdkwork-settings-menu`), and it must not learn billing semantics. The card arrives through a slot:

- **Contract owner**: `packages/client/ui-settings` declares `settings.menu.account` with one owner share, `{ close }` — the only shell affordance content there needs, because the card opens a wider surface and the menu must not stay on top of it.
- **Shell**: `ui-sdkwork-settings-menu` declares the seat in its children table and renders it as a non-interactive block directly under the account identity row, before the menu's own commands. Clicking a row closes the menu; the card asks for the same through `close`.
- **Primitive**: `SubmenuMenu` gained a `block` entry (`{ type: 'block', id, node }`) that joins the list's flex column via `display: contents` without becoming a `menuitem`. This is the minimal extension that lets an owner place content between rows without inventing a command for it or reimplementing the menu.
- **Plugin**: `SettingsUsageCard` registers into `settings.menu.account` with `ctx.slots.inject`, so a host that does not declare the seat simply shows no card. Its slot type is declared locally in the plugin repository (module augmentation) because that repository builds against published `0.2.2-rc.1` packages; the two declarations describe the same single/root seat.

### Both cards show one set of numbers

The settings card does not fetch anything. `ctx.billingMetrics` (already the plugin's read-only service for theme consumers) now also publishes the sidebar card's full face as `BillingCardSnapshot`: today/week/month cost and tokens, the 7-day sparkline, the day-over-day delta, the display currency, the card preferences, and the read-failure reason. The sidebar instance publishes it on every render where those values change; the settings card reads/subscribes and renders the same gauge, label, figure, delta badge, and sparkline.

That is the reason the seat exists rather than a second fetch: recomputing today's cost in a second place would eventually show a different number for the same money (user-price recosting, currency, span, and failure state all live in the sidebar instance's calculation). The visible consequence of the design is that hiding the card does **not** stop the sidebar instance from polling — it is what keeps the settings card instant when the gear is opened.

## Alternatives considered

**Keep the submodule read-only and render a card in the host package.** The settings menu would draw its own card from `ctx.billingMetrics` and the plugin would only keep the sidebar card. Rejected: two card implementations drift, the host package would own billing copy and layout, and the fork's settings shell would depend on another feature's semantics.

**Add a host-config default for the card mode.** Rejected: the card mode is a client localStorage preference that the plugin's host half never reads; a config field would need a new client read path, and it still would not cover the settings-menu card.

**Force the card hidden with no user control.** Rejected: it removes the plugin's own recovery contract (full / compact / hidden) and makes "bring the sidebar card back" impossible without a code change; the product decision is a default, not a lock.

**Show the card in both places.** Rejected: it keeps the sidebar clutter the change exists to remove and duplicates the same number on screen.

**Move the whole dashboard into settings.** Rejected: the dashboard is a wide, tabbed modal; the settings menu holds one card that opens it. The card is the entry, the dashboard stays the surface.

## Consequences

- A fresh install shows no usage card in the sidebar; the gear menu answers today's spend under the user name, and clicking the card opens the dashboard. Existing stored preferences still win, and the Settings page restores the sidebar entry at any time.
- The two cards cannot disagree by construction: one calculation, one published snapshot. The metrics service grew `readCard`/`subscribeCard`/`publishCard`; `BillingCosts` consumers are unaffected.
- The settings menu's row model gained a block entry in the fork-owned `SubmenuMenu`; any future owner can place content between rows without a new command.
- Upstream plugin releases are now fork merges rather than pin bumps: plugins/README.md documents the build-before-commit workflow, and the pin records the fork's own release commit (`1.8.4-sdkwork.3`).
- Size cost: `lib/client.js` grew to 372,327 bytes (363.3 KiB) — about 9.0 KiB over the upstream `1.8.3-alpha.4` artifact, still far under the plugin's self-imposed 500 KiB warning line.

## Verification

- `packages/client/ui-primitives/tests/submenu-menu.client.spec.tsx` renders a block between a heading and a row, and asserts it is not a `menuitem` and cannot select.
- `packages/client/ui-sdkwork-settings-menu/tests/settings-menu-root.client.spec.tsx` asserts the account card's DOM position under the identity row and above the first command, that it is not a menu row, and that its `close` shuts the menu.
- The plugin's `tests/settings-menu-card.component.spec.tsx` covers the projection (currency, span, token view, delta, failure title) and the click contract (`openDashboard` then `close`); `tests/billing-card-settings.spec.ts` pins the new default.
- The plugin's `tests/usage-billing.client.spec.tsx` asserts the composer-footer card holds both switches with both off, and that the position control only appears once the price switch is on; `tests/live-cost.client.spec.tsx` and `tests/task-queue-quick.client.spec.tsx` pin the two preference defaults and their stored-preference compatibility; `tests/composer-defaults-migration.spec.ts` covers the one-time reset (an old persisted `true` is switched off once, a later manual on survives, and the other fields are untouched).
- `packages/bundle/web-app/tests/built-in-usage-billing.spec.ts` fails if the shipped client bundle stops registering `sidebar.footer.action`, `settings.section`, or `settings.menu.account`.
