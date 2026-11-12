---
description: "SDKWork 个人主页 plugin: the settings section presenting the signed-in SDKWork account (personal and enterprise) and the second sign-out entry point, both reading the ui-sdkwork-iam service."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-profile

English | [中文](README.zh.md)

## Summary

SDKWork 个人主页 plugin: one settings section (id `profile`, order `-190`, directly below General) that presents the signed-in account as a personal page — the personal account and the enterprise organization the session belongs to — lists the SDKWork products that share the account, and offers a sign-out button beside the settings popover's footer row. Account facts come from the `ui-sdkwork-iam` service's profile snapshot; the section owns no auth runtime and no settings namespace.

## Table of Contents

- [Surface](#surface)
- [Data](#data)
- [Sign-out](#sign-out)
- [Implementation notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Surface

The plugin registers one `settings.section` contribution and its dictionary:

- **Nav row `个人主页`** (`settings.section`, id `profile`, order `-190`): the settings panel's second nav entry, directly under `通用`. `ui-sdkwork-settings-menu` draws the rail glyph for the known id.
- **The section body**: an identity header (initials tile, display name, account-type badge, e-mail, management-center action), a `个人 / 企业` tab pair, an account-information card, a linked-accounts card, and a footer with the sign-out hint and button. The enterprise tab shows the organization/tenant ids the session was issued for, or a personal-account empty state that points at the management center.
- **Signed-out state**: an anonymous visitor gets the sign-in entry instead of a blank page, so the section is never a dead end.

## Data

`IamProfileSnapshot` (`ui-sdkwork-iam`) is the single value the section reads: display name, e-mail, username, account id, organization/tenant ids, account kind (`personal` or `enterprise`; the IAM login context reports `organizationId: '0'` for a personal session), the active environment and app id, the CloudRouter management-center origin, and whether sign-out is available. The IAM service memoizes the snapshot by controller state plus the environment facts, so the `useProfile` hook observes a stable reference until a fact moves.

## Sign-out

The footer button calls `iam.requestSignOut()`, the same service entry the settings popover's footer row uses. The service raises its confirmation dialog; confirming opens the CloudRouter-hosted sign-out page (`<cloudRouterUrl>/auth/sign-out`, implemented by `@sdkwork/auth-pc-react` and mounted by the CloudRouter application) in the system browser and clears this page's session. The section itself never opens a browser or clears tokens.

## Implementation notes

- The section is gated on the `iam` Cordis service: a composition without `ui-sdkwork-iam` leaves the plugin pending, so no account page renders without an account service.
- The package's tsc emit resolves the sdkwork auth imports to `ui-sdkwork-iam`'s declaration facades (`../ui-sdkwork-iam/sdkwork-types/`) instead of duplicating them; the type-only import of `IamProfileSnapshot` is the shared declaration, not a value dependency on the other plugin's implementation.

## Model Experience

None, as the profile section is browser-side account UI; it neither assembles nor sends model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **No profile editing** — the section presents the account and links to the management center; changing the display name, e-mail, or password stays a hosted-surface concern.
- **Enterprise data is limited to the session context** — organization name and member permissions need an IAM organization read the current app SDK face does not expose; the page shows the ids it has and points at the management center.
- **Linked accounts are static** — the card names the SDKWork products that share the account instead of querying a linkage ledger, because no such ledger is published to this surface today.
