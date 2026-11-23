# Agent Note: A quota failure row keeps a top-up gesture

Status: implemented

English | [中文](2026-11-23-quota-failure-row-top-up-seat.zh.md)

## Problem

A terminal Turn failure shows one durable row. For an exhausted balance that row kept only the provider-neutral `message.failure.quota` copy, while the actionable repair lived in the frame-wide `shell.quota-notice` entry, whose surface is transient: it appears when the failure is appended and it is dismissed, replaced, or superseded by later notices. A reader who scrolls back to the failure, or who returns to the Session after the notice is gone, saw a failure with no path forward — even though the same product, for the same failure code, already knows the balance surface that repairs it. The relay routes the shipped build offers are billed to the signed-in account, so "quota exhausted" is exactly the case where a repeated, durable top-up affordance is useful.

## Decision

Chat's quota failure row declares one more repair seat, `conversation.chat.turn-error.top-up`, with the same `TurnErrorRepairOwnerProps` currency as the credential seats: the stable failure code plus a localized label. The row renders the neutral quota copy and appends whatever the seat returns; it passes `message.failure.quota.action` as the label and no fallback, so an unoccupied seat adds nothing at all. Chat therefore still owns no provider or billing logic: the copy stays one localized sentence fragment, and the gesture exists only where a feature contributes it.

`ui-settings-account` fills the seat. Its entry answers `QUOTA` and `ACCOUNT_QUOTA` and reads the live account snapshot through the same `hooks.account` observable as the settings page and the quota notice. With the shared native Platform host it requests the `top-up` page through the existing `PlatformPages` channel, so a Desktop user lands in the one opaque native view and the opener's return re-read; because that embedded page carries its own sign-in, the durable row keeps the gesture even while the account is signed out. In an ordinary browser the entry links the account's hosted top-up URL in a new tab, and only while a stored credential makes that page the reader's own account. The page request is not tied to the row's lifetime — a later request or the viewer's own return retires it — so re-rendering the transcript cannot close the page under the user.

## Alternatives considered

**Claim `QUOTA` in the frame-wide notice and let the notice carry the action.** The notice is transient by construction and its retention protocol belongs to the entry that opens a page; making it durable would turn one notice slot into a per-failure list and duplicate what the transcript already renders. The row is the durable record, so the durable affordance belongs there.

**Have Chat render a fixed top-up button for every quota failure.** Chat cannot tell whether the exhausted balance belongs to the signed-in product account or to a third-party API key, and it must not parse provider prose to guess. A shipped button would send API-key users to unrelated billing. The seat keeps that eligibility decision in the feature that owns the account and the billing surface.

**Reclassify relay quota as `ACCOUNT_QUOTA` at the route and rely on the existing notice Modal.** That would make the repair reachable only while the notice lives, which is the problem this change addresses, and it would also newly raise the account Modal for a failure whose Modal copy names the account balance rather than the relay route. The row seat leaves failure classification unchanged.

**Duplicate the link styles in Chat.** Chat must not style or import a feature's affordance; the seat renders a normal link element the feature styles from its own module. Copy stays in Chat's dictionaries because the row owns the sentence.

## Consequences

The failure row now offers the same repair as the quota notice, for as long as the transcript shows it, and the two surfaces share one account snapshot and one native page channel. A Desktop row keeps its gesture across a sign-out; a browser row without a stored credential, or a snapshot without a top-up URL, shows the unchanged neutral copy, so no dead end or wrong-billing path is introduced. The account package gains one leaf component and one `slots.inject` registration behind `account/watch`, and Chat gains one declared child slot plus one locale key; every composition without the account plugin renders exactly what it did before.

A third-party API key's quota failure in a signed-in product build still receives the account's top-up link, because the row does not know which credential the request used. The copy names no provider, and the link opens the product's own balance surface rather than a provider's, so the affordance stays truthful about where it goes; a future route-aware classification would need the failing request's provider at the row boundary, which the durable failure record does not carry.

The row's `role="status"` text is unchanged when the seat is empty, keeping existing golden snapshots valid. The link is inside that status region, so it is announced with the failure, and its own focus outline comes from the feature's stylesheet.

## Testing

`quota-top-up-action.client.spec.tsx` covers the browser link, the Desktop page request, both quota codes, every declined state, and the not-yet-loaded snapshot. `chat-view.client.spec.tsx` covers the empty seat (unchanged neutral text) and the filled seat's label, code, and placement inside the failure row, and `chat-apply.client.spec.tsx` pins the declared child slot. The account apply spec asserts the entry exists with account access and is absent without it.

## Related

- [Account quota top-up action](../../archived/feature/2026-09-18-account-quota-top-up.md)
