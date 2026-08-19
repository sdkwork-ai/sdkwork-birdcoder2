# Agent Note: Token Plan as a composed client mode

Status: implemented

English | [中文](2026-08-17-token-plan-client-mode.zh.md)

## Problem

BirdCoder needs one place for users to browse membership plans, purchase or renew a plan, recharge Token Bank value, and redeem coupons. These capabilities already belong to SDKWork Membership and Order, while BirdCoder navigation and authentication belong to client plugins. Putting commerce behavior in the layout or copying CloudRouter routes would give the wrong package ownership and couple BirdCoder to another host's navigation.

## Decision

`@deepseek-ai/dsh-client-ui-token-plan` owns the `token-plan` mode, its rail entry, locale, page, SDKWork composition, and package invariant. The mode rail orders it last among regular entries, so the separately pinned Settings seat remains directly below it. `AppFrame` renders the page through the keyed `mode.page` slot; no router path or Settings section participates.

The page reuses `SdkworkSubscriptionCatalogPage` from Membership and injects Order-backed checkout, recharge, and coupon components. Membership remains responsible for catalog and plan behavior. Order remains responsible for payment creation, payment status, Token Bank recharge, and coupon redemption.

The plugin creates Membership and Order clients for `ctx.env.apiBaseUrl()`. One browser-global token manager from `ui-iam` serves both clients and every other SDKWork-backed plugin. IAM session tokens are the signed-in checkout credentials; a static environment access token fills Access-Token when the IAM session omits it, and is the anonymous catalog credential when signed out. Membership checkout requires both Access-Token and authToken, so a signed-in purchase merges IAM `authToken` with the env access token when the session has no access token of its own. Environment and IAM subscriptions refresh credentials, and an environment URL change invalidates the composed clients. Host checkout dialog identities stay stable across locale refreshes so `createPayment` is not aborted by remount. Anonymous catalog browsing remains available, while account-required actions call `ctx.iam.openSignIn()`.

SDKWork catalog and dialog styles are compiled from Membership, Order, and ui-pc-react Tailwind sources and inlined under the Token Plan plugin ownership marker. The page mounts `SdkworkThemeProvider` (`tech-blue`, host `themeSelection`) so `--sdk-color-*` / `--theme-primary-*` and `html.dark` match membership-pc: catalog `dark:` utilities and portaled Order dialogs follow the host scheme. Tailwind preflight stays out of the compiled sheet; a scoped reset applies only under `[data-token-plan-surface]`. The catalog wrapper `[data-token-plan-catalog]` forces Membership plan cards to four columns so the AppFrame center column does not wait on viewport `lg:grid-cols-4`. Light mode remaps the hardcoded-dark points recharge dialog. The client loader can therefore remove those styles when the plugin unloads.

## Alternatives considered

**Add Token Plan to Settings.** Token Plan is a primary application task rather than configuration. A Settings section would also prevent the requested persistent rail entry and mode page.

**Copy the CloudRouter integration.** CloudRouter-specific wallet routes and redirects do not exist in BirdCoder. Reusing the SDKWork components and service ports preserves their business ownership without importing host navigation.

**Implement membership and payment UI locally.** Local copies would duplicate plan mapping, payment polling, and recharge behavior and could diverge from SDKWork's maintained components.

## Consequences

BirdCoder gains one independently loadable commerce mode whose registration and styles are reversible. The feature requires a configured SDKWork API base URL and the Membership and Order browser dependency closure. Token Bank details stay inside the mode because BirdCoder has no separate wallet route.
