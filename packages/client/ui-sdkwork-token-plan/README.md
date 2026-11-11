---
description: "Token Plan application mode: the SDKWork membership subscription catalog page composing Order checkout, Token Bank recharge, and coupon redemption dialogs."
kind: "package-reference"
---

# Token Plan

English | [中文](README.zh.md)

## Summary


`@deepseek-ai/dsh-client-ui-sdkwork-token-plan` contributes the `token-plan` application mode. Its rail entry is the final mode entry, immediately above the independent Settings seat. It also contributes the settings-menu wallet card (`settings.menu.plan`): the signed-in account's plan name and compute-point balance, read from the same Membership service as the page, with upgrade and top-up actions that open the mode. The same service backs a `套餐与积分` settings section (`settings.section` id `points`) with the available/frozen wallet split, recent points ledger, overview progress, and an upgrade route.

The page renders the SDKWork membership subscription catalog and composes SDKWork Order checkout, Token Bank recharge, and coupon redemption dialogs. Membership owns catalog and plan behavior; Order owns payment and recharge operations.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin requires `ctx.env`, `ctx.iam`, and `ctx.theme`. It creates SDKWork clients for the active API base URL. IAM session tokens are the signed-in checkout credentials; a static environment access token fills Access-Token when the IAM session omits it, and is the anonymous catalog credential when signed out. Membership checkout requires both Access-Token and authToken. Environment and IAM subscriptions refresh credentials, and an environment URL change invalidates the composed clients. The page compiles Membership/Order Tailwind utilities into the plugin stylesheet, applies the host light/dark scheme with `.dark` and `--sdk-color-*` tokens, and uses the Agents Token Plan layout (`max-w-7xl` catalog, one row of four plan cards, `#0e0e11` dark canvas). Anonymous users may browse the catalog. Account-required actions open BirdCoder's configured sign-in surface.

The points purchase, points balance, and redemption dialogs render in BirdCoder's own modal material. Points balance and redemption use the ui-primitives `Modal`; the Order-owned recharge dialog keeps its behavior and its SDKWork palette is re-pointed at the `--dsw-*` semantic aliases in `pointsRechargeTheme.css`. Because those aliases flip with `body[data-ds-dark-theme]`, every dialog follows the appearance setting in both color schemes without a light/dark branch.

Recharge orders and coupon redemptions are user-initiated mutations and require an IAM session. `TokenPlanService` holds each one behind `requireSignedInInPlace()`, which raises the in-app sign-in overlay over the open dialog instead of leaving the workspace for the desktop welcome page: the payment surface stays on screen, the overlay covers it, and the same request resumes with the credentials the finished login installed. A dismissed overlay answers with the localized `commerce.signInRequired` notice rather than the gateway's bearer-token failure.

The active environment must provide an API base URL before the page can issue catalog or commerce requests. The page reports the missing configuration instead of selecting another deployment implicitly.

## Model Experience

None, as the Token Plan page is browser-side SDKWork commerce UI and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Live gateway required** — the page depends on a configured SDKWork API environment and live Membership and Order gateway responses; there is no offline catalog. The settings wallet card has the same dependency: it hides while signed out and shows a retry when the summary read fails.
- **No wallet integration** — CloudRouter wallet routes and a separate persistent wallet mode are not offered.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

IAM session tokens are the checkout credentials; the static environment token only fills Access-Token when the IAM session omits it and is the anonymous catalog credential when signed out, while Membership checkout requires both Access-Token and authToken. The page fails loud on a missing API base URL rather than implicitly selecting another deployment.

</details>

## Runtime invariants

No runtime invariant companion is published; the token-plan surface reads the authoritative usage and plan facts from the owning controller and renders them statelessly; refresh agreement is covered directly by this package client behavior specs.
