# @deepseek-ai/dsh-client-ui-appstore

English | [中文](README.zh.md)

The SDKWork App Store application mode. This browser plugin owns the `appstore` rail entry and mounts the SDKWork App Store PC surface through `@sdkwork/appstore-pc-host`. It registers keyed `mode.rail.entry` and `mode.page` contributions; selecting the entry changes the layout mode, and the frame renders the page in the center column.

## Runtime requirements

The active [ui-env](../ui-env/README.md) profile supplies the API base URL and optional static access token. An empty base URL leaves the page empty and creates no SDKWork runtime. A static environment token takes precedence over the current [ui-iam](../ui-iam/README.md) session. Host `zh` requests `zh-CN`; other shipped host locales request `en-US`. Environment changes remount the SDKWork runtime; IAM and locale changes propagate through host props.

## Embedded surface

The page mounts the full SDKWork App Store product shell inside BirdCoder's existing frame: Discover, search, categories, library, wishlist, updates, app detail, and publisher routes run in an isolated in-page router owned by `@sdkwork/appstore-pc-host`. SDKWork navigation does not add a browser route or a persisted BirdCoder preference.

## Model Experience

None, as mode selection, storefront browsing, catalog searches, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Sibling checkout required** — local builds resolve the SDKWork App Store PC packages from `../sdkwork-appstore` beside this repository.
- **Online authenticated catalog** — there is no offline cache or anonymous fallback when the deployed App Store API requires an SDKWork access token.
