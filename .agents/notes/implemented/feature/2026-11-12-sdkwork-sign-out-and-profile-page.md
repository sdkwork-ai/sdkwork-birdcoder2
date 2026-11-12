# Agent Note: SDKWork sign-out and the 个人主页 settings page

Status: implemented

English | [中文](2026-11-12-sdkwork-sign-out-and-profile-page.zh.md)

## Problem

The fork's account lifecycle had two gaps. Sign-out was a single unguarded click
that only cleared the local session: the shared SDKWork account session in the
browser stayed alive, so the next login skipped the account methods and a user
who believed they had signed out could be signed straight back in. And the
settings panel had no account page of its own — the signed-in identity, the
organization it belongs to, and the entry points into account management were
only reachable through the popover, which cannot hold a page's worth of facts.

The settings nav also opened on `套餐与积分` because General sat at `order: 0`,
below the Token Plan section's `-5`; deployment-wide preferences were not the
first page a user landed on.

Cancelling account-bound work when the session ends stays owned by
[the account-provider sign-out decision](../architecture/2026-09-17-account-provider-signout.md);
this note covers the SDKWork IAM account session only.

## Decision

Sign-out is one confirmation-first gesture shared by every entry point — the
settings popover's footer row, the account mode page's button, and the new
`个人主页` section. `ctx.iam.requestSignOut()` raises a confirmation dialog
(`shell.overlay` entry `iam-sign-out`); confirming opens the CloudRouter-hosted
sign-out page at `<cloudRouterUrl>/auth/sign-out` in the system browser (the
desktop `sdkworkDesktop.shellOpen` bridge, or a new tab on a plain page) and
then ends the local session through the auth controller. The browser leg is
skipped when the environment profile leaves `cloudRouterUrl` empty; the local
clear always runs.

The hosted page itself is implemented in `sdkwork-iam`
(`@sdkwork/auth-pc-react`): `auth-sign-out.ts` owns the route segment and the
path/URL builders, and `SdkworkAuthSignOutPage` is mounted by
`SdkworkIamAuthRoutes` at `<basePath>/sign-out`. The CloudRouter application owns
the URL path it serves (`PORTAL_AUTH_SIGN_OUT_PATH = '/auth/sign-out'`) and
exempts that route from its authenticated-auth-route redirect, because only a
signed-in visitor can end a session and redirecting them home makes sign-out
unreachable.

`ui-sdkwork-iam` publishes `profileSnapshot()`: one memoized value per
controller/environment state carrying the display name, e-mail, username,
account id, organization and tenant ids, personal-vs-enterprise account kind,
environment, app id, management-center origin, and sign-out URL. The new
`ui-sdkwork-profile` plugin renders that snapshot as the `个人主页` section
(order `-190`) with `个人` and `企业` pages, the SDKWork products that share the
account, and the section's own sign-out button. General moved to `order: -200`
so the rail opens with `通用` followed by `个人主页`.

## Alternatives considered

**Let the hosted page do the whole sign-out and redirect back to the app.** The
browser cannot reach this application's session store or its desktop shell, so
the app would stay signed in until its access token expired, and the deep-link
hand-off would need a second callback contract for a flow that has no secret to
return. Ending the local session in the app and the shared browser session in
the browser keeps each side responsible for what it owns.

**Keep sign-out local only.** A local clear leaves the SDKWork SSO session
alive; the next login silently succeeds and a shared machine stays usable. The
fork's account is shared across SDKWork products, so "sign out" must mean the
account, not one window.

**Serve the sign-out page from the BirdCoder origin.** BirdCoder's origins serve
no IAM auth routes; only the CloudRouter portal mounts the shared auth package.
Duplicating the page would mean a second copy of the session-clearing logic and a
second route contract to keep in step.

**Put the 个人主页 content in the settings popover.** The popover closes on
pointer-leave and cannot hold the account, organization, linked-product, and
sign-out surfaces at once; a `settings.section` is the seat those facts belong
in, and the popover keeps its compact account group.

## Consequences

- The account session now ends in two places by design: the browser (shared
  session) and the app (local session). A deployment that configures no
  CloudRouter origin signs out locally only — documented as a limitation rather
  than silently pretending the account is gone everywhere.
- The confirmation dialog is a second `shell.overlay` entry beside the sign-in
  host. It has its own store so a session end cannot inherit sign-in steps, and
  its open state is the only shared member; the account facts it shows come from
  the profile hook.
- `ui-sdkwork-profile` depends on the `iam` Cordis service, so a composition
  without `ui-sdkwork-iam` has no account page — the section is deliberately not
  a signed-out dead end when the service is absent.
- The CloudRouter path is published from one place per repository: the IAM
  package owns the route segment and URL builder, CloudRouter owns the mounted
  path and the auth-area exception, BirdCoder reads the origin from its
  environment profile. Tests in each repository pin the shared path.
