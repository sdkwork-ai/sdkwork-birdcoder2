---
description: "SDKWork Demand Hall: the sidebar quick entry below the template-library entry and its keyed demand-hall page hosting the App Store demand hall (publish and claim development demands) through @sdkwork/appstore-pc-embed."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-demand-hall

English | [中文](README.zh.md)

## Summary


The SDKWork Demand Hall (需求大厅). This browser plugin owns the `demand-hall` sidebar quick entry, ordered below the template-library entry (order 51 after 50) in the New Session button area, and the keyed `mode.page` contribution that the entry opens as a code-surface overlay: the rail selection stays `code` while the demand hall renders in the center column, and the sidebar stays mounted beside the overlay with its workspace and session lists. The page mounts the SDKWork App Store demand hall through `@sdkwork/appstore-pc-embed`'s single-page surface (`page: 'demands'`), configured from the shared environment, IAM, and locale services.

The embedded surface is the App Store storefront's demand hall page and keeps its feature set: the header banner, demand-type filter, search, demand cards, empty state, the publish-demand modal (title, type, category, budget, bid deadline, description), the demand detail modal, and the claim (我要抢单) flow with its bid form and bid statuses. Demand data is owned by the App Store company domain and served through the same platform gateway the templates catalog uses.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Embedded surface](#embedded-surface)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The active [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile supplies the API base URL and optional static access token. An empty base URL leaves the page on its unconfigured status face and creates no SDKWork runtime. A static environment token takes precedence over the current [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) session. Host `zh` requests `zh-CN`; other shipped host locales request `en-US`. Environment changes remount the SDKWork runtime; IAM and locale changes propagate through host props. Browsing demands is anonymous-friendly; publishing and claiming are account-bound and handled by the embedded surface's own sign-in flow.

## Embedded surface

The page hosts the App Store storefront's demand hall (header banner, search bar, publish button, category filter, demand cards) inside BirdCoder's existing frame, without the storefront's own navigation chrome. SDKWork navigation does not add a browser route or a persisted BirdCoder preference.

## Model Experience

None, as the quick entry, overlay selection, demand browsing, publishing, claiming, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Sibling checkout required** — local builds resolve the SDKWork App Store PC packages from `../sdkwork-appstore` beside this repository; the `demands` page of the embeddable single-page surface lives there.
- **Deployed demand backend** — the demand hall reads and writes the App Store company domain's demand endpoints; an environment whose gateway does not expose them renders the storefront's own empty/error faces.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Environment changes remount the whole SDKWork runtime while IAM and locale changes propagate through host props — preserve that split when touching the adapter. The host adapter, theme shell, and tsdown CSS/alias machinery are deliberate per-package copies shared with `ui-sdkwork-markets` and `ui-sdkwork-template-library` (client-bundle purity forbids cross-plugin value imports); change them together. Local builds resolve `@sdkwork/appstore-pc-embed` from the `../sdkwork-appstore` sibling checkout, so the package cannot build without it.

</details>

## Runtime invariants

No runtime invariant companion is published; the package contributes a keyed page entry whose ownership is already authoritative in the slot registry, while the catalog adapter has no independent host relationship to compare against.
