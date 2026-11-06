# Agent Note: Every market category lands on its cloud catalog

Status: implemented

English | [中文](2026-11-06-markets-cloud-catalog-first.zh.md)

## Problem

The Markets page orders each category's views differently. The Plugins chip row led with the community Plugin Market (`dshmarket`) and only then showed the SDKWork cloud catalog; the Skills chip row led with the SkillHub market and put the cloud catalog second. Experts already showed the cloud catalog as its only surface, while Connectors mounted the MCP connector plugin's panel and had no cloud catalog at all. The product wants the SDKWork catalog to be the shelf every category opens on: the cloud catalog first, and selected by default, in all four categories.

The earlier order was itself a deliberate product decision ([The Plugin Market inside the Plugins tab](2026-10-31-plugin-market-subtab.md)); this note reverses that decision, and that record now carries a superseded pointer to this one. The two SkillHub notes keep their decisions (the market is embedded, and its sidebar row stays suppressed) and are superseded only in the chip order.

## Decision

The cloud catalog is now the leading chip of every sub-root category and the landing view of every category:

- **Plugins** — `cloud | market | official | installed`, landing on `cloud`. The hairline divider still precedes `official`, so the chip row reads as `[cloud catalog · plugin market] | [this app's plugins]`. The Plugin Market keeps its gate (install/reload faces) when the market plugin is absent.
- **Skills** — `cloud | market`, landing on `cloud`. The SkillHub panel still draws in place on its own chip; the add menu's market row still switches to it.
- **Connectors** — new sub-root `cloud | connector`, landing on `cloud`. The cloud chip renders the App Store's `mcp` page, the one storefront page this product had not given a home; the connector chip keeps the existing framed `dsh-mcp-connector` panel and its host bridge.
- **Experts** — unchanged: the cloud catalog is the tab's whole surface, so it is already both first and default. Its my-catalog affordance keeps opening the My-experts page.

Switching a main category resets every sub-tab to `cloud`, so re-entry never restores a previously browsed local view. The header search field now belongs to every cloud catalog (plugins, experts, skills, connectors) and collapses only for the embedded panels that own their own search (Plugin Market, SkillHub, MCP connector). The Plugin Market gate's inventory read runs only while its chip is open, because the cloud catalog now owns the entry surface.

## Alternatives considered

**Reorder only the chips that already exist.** That leaves Connectors without a cloud catalog and makes the reported problem ("all four categories") unaddressable there; the App Store already publishes the MCP catalog page.

**Give Experts a chip row too.** Its only sibling would be the My-experts page, which is a full-column view with its own back control; turning it into a chip would duplicate navigation and change a flow the request did not mention. Experts is recorded as already satisfying cloud-first.

**Keep the Plugin Market's install gate on the landing surface.** The gate exists to make the market discoverable before it is installed; the market chip keeps that face, and the cloud catalog links to it through the existing "open cloud catalog" affordance on the gate (now a one-chip move in the other direction).

## Consequences

- `MarketsPage` owns a third sub-tab state (`ConnectorsSubTab`) and a second sub-tab strip; `TAB_MARKET_PAGES` now covers all four categories, with `connectors: 'mcp'`.
- New locale keys `subtab.connector` and `subtabs.connectors.label` (both dictionaries).
- Entering the Markets page mounts the App Store plugin catalog surface, so the storefront runtime starts one chip earlier than before; the community market's inventory read no longer happens on entry, which is the accepted trade for landing on the product's shelf.
- The package spec covers the new ordering, the defaults, the reset behavior, the connector cloud chip and its panel, and the search field's presence per chip; the README pairs were updated with the new information architecture.
