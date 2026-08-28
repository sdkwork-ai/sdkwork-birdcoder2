---
description: "Token Plan application mode: the SDKWork membership subscription catalog page composing Order checkout, Token Bank recharge, and coupon redemption dialogs."
kind: "package-reference"
---

# Token Plan

English | [中文](README.zh.md)

## Summary


`@deepseek-ai/dsh-client-ui-sdkwork-token-plan` contributes the `token-plan` application mode. Its rail entry is the final mode entry, immediately above the independent Settings seat.

The page renders the SDKWork membership subscription catalog and composes SDKWork Order checkout, Token Bank recharge, and coupon redemption dialogs. Membership owns catalog and plan behavior; Order owns payment and recharge operations.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin requires `ctx.env`, `ctx.iam`, and `ctx.theme`. It creates SDKWork clients for the active API base URL. IAM session tokens are the signed-in checkout credentials; a static environment access token fills Access-Token when the IAM session omits it, and is the anonymous catalog credential when signed out. Membership checkout requires both Access-Token and authToken. Environment and IAM subscriptions refresh credentials, and an environment URL change invalidates the composed clients. The page compiles Membership/Order Tailwind utilities into the plugin stylesheet, applies the host light/dark scheme with `.dark` and `--sdk-color-*` tokens, and uses the Agents Token Plan layout (`max-w-7xl` catalog, one row of four plan cards, `#0e0e11` dark canvas). Anonymous users may browse the catalog. Account-required actions open BirdCoder's configured sign-in surface.

The active environment must provide an API base URL before the page can issue catalog or commerce requests. The page reports the missing configuration instead of selecting another deployment implicitly.

## Model Experience

None, as the Token Plan page is browser-side SDKWork commerce UI and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Live gateway required** — the page depends on a configured SDKWork API environment and live Membership and Order gateway responses; there is no offline catalog.
- **No wallet integration** — CloudRouter wallet routes and a separate persistent wallet mode are not offered.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

IAM session tokens are the checkout credentials; the static environment token only fills Access-Token when the IAM session omits it and is the anonymous catalog credential when signed out, while Membership checkout requires both Access-Token and authToken. The page fails loud on a missing API base URL rather than implicitly selecting another deployment.

</details>
