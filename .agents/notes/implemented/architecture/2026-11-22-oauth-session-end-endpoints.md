# Agent Note: OAuth session-end endpoints for the desktop sign-out

Status: implemented

English | [中文](2026-11-22-oauth-session-end-endpoints.zh.md)

## Problem

Desktop sign-in is an OAuth public-client flow: the system browser opens the hosted authorization page on the deployment's `iamAuthorizeBaseUrl` (`/iam/oauth/authorize`), and the deep-link hand-off exchanges the code for the dual-token session. Sign-out did not belong to that surface. Its browser leg opened `<cloudRouterUrl>/auth/sign-out` — the CloudRouter console's own portal origin, a different domain from the login — so the browser landed somewhere the user never signed in, that holds none of this deployment's session, and the CloudRouter console became part of the product's auth contract. The hosted session end also had to be skipped entirely when a deployment published no CloudRouter origin, even though its login origin was always configured.

## Decision

Every hosted session-end URL is built on the origin the browser login opens — the OEM profile's `iamAuthorizeBaseUrl` — by one module, `packages/client/ui-sdkwork-iam/src/client/oauth-session.ts`:

| Realm | Endpoint | Meaning |
|---|---|---|
| Desktop shell (preload bridge present) | `<iamAuthorizeBaseUrl>/oauth/logout?client_id=<clientId>` | Ends the OAuth public client's browser session, scoped by the client id the authorization presented |
| Page-local session (plain browser page, in-app account form) | `<iamAuthorizeBaseUrl>/oauth/sign-out` | Hosted sign-out page for a session with no OAuth client binding |

The realm is the fact that already decides the login gesture: the desktop shell signs in as an OAuth client, while a plain page renders the in-app form. The client id comes from the same OEM read the login uses (`readOemIamClientId() ?? DEFAULT_IAM_CLIENT_ID`), so the login and the logout cannot name different clients.

The browser leg stays advisory. The product leg is authoritative on its own: the local session is revoked through the refresh token against the IAM app-api logout operation (which still works after the access token expired), and the durable copy, the embedded SDKWork credentials, and the shared token manager are cleared in a `finally` path. A browser that refuses to open, or a hosted surface that does not serve these endpoints, therefore cannot leave the user signed in. `ui-sdkwork-env`'s `cloudRouterUrl` keeps only the `个人主页` management-center link.

The decision supersedes the browser leg of [SDKWork sign-out and the 个人主页 settings page](../feature/2026-11-12-sdkwork-sign-out-and-profile-page.md); that note's confirmation-first gesture, local clear, and profile section are unchanged.

## Alternatives considered

**Keep the CloudRouter-hosted page.** The origin the user never signed in on cannot end the browser session the login created, and it made the console's portal a required part of this product's auth surface; a deployment without a CloudRouter origin had no browser leg at all.

**Open `<iamAuthorizeBaseUrl>/auth/sign-out`.** The origin is right, but that page is a product route of the shared auth application rather than an endpoint of the OAuth surface the login uses. The desktop app would still depend on one hosted application's route table, and there is no page-local and client-scoped split.

**Drop the browser leg and rely on the server revoke alone.** The revoke ends the product session, but the browser session the authorization created stays alive, and the next browser sign-in then skips the account methods — the defect the confirmation-first sign-out was introduced to fix.

**Send OIDC RP-initiated logout parameters (`id_token_hint`, `post_logout_redirect_uri`, `state`).** The IAM OAuth server issues no `id_token` and implements no `nonce` or `prompt`, and the desktop has no browser return target, so every such parameter would be absent or unused; the client id is the only binding the endpoint can honor.

## Consequences

- The hosted auth surface must serve the OAuth group's `/oauth/logout` and `/oauth/sign-out`. A deployment that does not serve them opens a page that cannot end the browser session, while the product session is still revoked and cleared; the package README records that limitation.
- Sign-out no longer depends on an environment-profile origin. An empty `cloudRouterUrl` removes the management-center link only, and `IamProfileSnapshot.signOutUrl` is a string on every realm.
- The endpoint paths and their query shape live in one module, so a deployment that moves its OAuth group changes two constants instead of hunting call sites. `oauth-session.client.spec.ts` pins the URLs, and `iam-sign-out.client.spec.ts` pins both realms against the OEM projection.
