---
description: "SDKWork Template Library: the sidebar quick entry below the market entry and its keyed template-library page hosting the App Store templates catalog through @sdkwork/appstore-pc-embed."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-template-library

English | [中文](README.zh.md)

## Summary


The SDKWork Template Library. This browser plugin owns the `template-library` sidebar quick entry, ordered below the market entry (order 50 after 40) in the New Session button area, and the keyed `mode.page` contribution that the entry opens as a code-surface overlay: the rail selection stays `code` while the templates catalog renders in the center column. The page mounts the SDKWork App Store templates catalog through `@sdkwork/appstore-pc-embed`'s single-page surface (`page: 'templates'`), configured from the shared environment, IAM, and locale services.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Embedded surface](#embedded-surface)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The active [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile supplies the API base URL and optional static access token. An empty base URL leaves the page on its unconfigured status face and creates no SDKWork runtime. A static environment token takes precedence over the current [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) session. Host `zh` requests `zh-CN`; other shipped host locales request `en-US`. Environment changes remount the SDKWork runtime; IAM and locale changes propagate through host props.

## Embedded surface

The page hosts the App Store storefront's templates catalog (header banner, category filter, search, template cards) inside BirdCoder's existing frame, without the storefront's own navigation chrome. Catalog browsing stays anonymous; the embedded surface opens its own sign-in flow for account-bound actions. SDKWork navigation does not add a browser route or a persisted BirdCoder preference.

## Model Experience

None, as the quick entry, overlay selection, catalog browsing, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Sibling checkout required** — local builds resolve the SDKWork App Store PC packages from `../sdkwork-appstore` beside this repository; the `templates` page of the embeddable single-page surface lives there.
- **Online authenticated catalog** — there is no offline cache or anonymous fallback when the deployed App Store API requires an SDKWork access token.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Environment changes remount the whole SDKWork runtime while IAM and locale changes propagate through host props — preserve that split when touching the adapter. The host adapter, theme shell, and tsdown CSS/alias machinery are deliberate per-package copies shared with `ui-sdkwork-markets` and the other SDKWork surface packages (client-bundle purity forbids cross-plugin value imports); change them together. Local builds resolve `@sdkwork/appstore-pc-embed` from the `../sdkwork-appstore` sibling checkout, so the package cannot build without it.

</details>

## Runtime invariants

No runtime invariant companion is published; the package contributes a keyed page entry whose ownership is already authoritative in the slot registry, while the catalog adapter has no independent host relationship to compare against.
