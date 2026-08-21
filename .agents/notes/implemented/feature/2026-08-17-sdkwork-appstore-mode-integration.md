# Agent Note: SDKWork App Store mode integration

Status: implemented

English | [中文](2026-08-17-sdkwork-appstore-mode-integration.zh.md)

## Problem

The App Store rail icon needs to open the SDKWork storefront inside BirdCoder. The private SDKWork PC application owns a router, authentication shell, theme providers, global aliases, and private workspace packages, while BirdCoder already owns mode navigation, deployment configuration, authentication, locale, and browser plugin loading.

## Decision

`@deepseek-ai/dsh-client-ui-sdkwork-appstore` is an independent mode plugin in the [app-mode rail](2026-08-16-sidebar-app-modes.md). It owns the App Store glyphs and copy, registers the keyed `appstore` rail entry and page, and uses the layout store's existing mode action. App Store selection remains transient layout state and adds no browser route or persisted preference.

The plugin embeds the SDKWork App Store PC surface through `@sdkwork/appstore-pc-host`, matching the Drive and Knowledge Base host-integration pattern. The `appstoreHost.ts` module maps the shared `ctx.env`, `ctx.iam`, and `ctx.locale` services to the host component inputs before registering the page. A configured static environment access token takes precedence over IAM credentials; environment changes remount the SDKWork runtime, and IAM or locale changes propagate through host props.

## Type and bundle integration

The package's declaration-emission project skips strict checking of the sibling SDKWork implementation. A separate no-emit TypeScript project compiles the consumed SDKWork source closure with one React type identity, and the browser bundle compiles SDKWork Tailwind output, resolves plain CSS `@import` chains, and aliases SDKWork router and i18next dependencies into one tree-shaken `client.js` closure.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Keep the SDK-only Discover reimplementation | It duplicated `@sdkwork/appstore-pc-product` UI and could not expose library, install, publisher, or detail flows without rebuilding the private PC application piecemeal |
| Mount the private SDKWork PC application root directly | Its Vite bootstrap, auth shell ownership, and deployment aliases conflict with BirdCoder's keyed page and host-owned services |
| Keep App Store as a `ui-sdkwork-app-modes` placeholder | The shell package would own SDKWork business behavior and credentials instead of a feature-owned entry and page |
| Add App Store-specific environment or auth settings | `ui-sdkwork-env` and `ui-sdkwork-iam` already own deployment and identity; copied state would diverge during environment switches and sign-out |

## Consequences

Clicking the App Store icon replaces the Code conversation with the real SDKWork App Store surface, and returning to Code restores the workbench. The integration reuses BirdCoder deployment, identity, locale, and keyed mode composition without importing the private PC application root. SDKWork storefront requests remain browser traffic and add no Harness prompt content, tools, session events, or KV Cache input.

The integration requires the `../sdkwork-appstore` sibling checkout and generated clients. Its complete application and compiled styles reside in one large client-plugin closure.

## Verification

Host-bridge tests cover credential precedence, session mapping, environment remount, locale propagation, and disposal. Page and apply tests cover keyed registration, teardown, and the SDKWork page marker. The SDKWork source-check project and bundle inspection pin the real source closure, single-file output, compiled Tailwind styles, and permitted platform imports.
