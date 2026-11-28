# Agent Note: Mobile-connection shortcut above the message center

Status: implemented

English | [中文](2026-11-26-mobile-connect-rail-entry.zh.md)

## Problem

The client has no in-product path from the desktop to the product's mobile clients: the Flutter App and the WeChat mini-program ship as separate applications, and nothing in the workspace offers their scan destinations. The product also wants one visible place that records whether this installation is open to mobile connections. The rail's bottom cluster is where product-level shortcuts already live — the `mode.rail.panel` seat declared for the [IM connector](2026-10-20-im-connector-rail-entry.md) renders it above Settings, with the message center at order 20 — so the new entry belongs directly above the message center.

The reference the product supplied is a hover popover: two scan destinations, a QR code, and an "allow mobile devices to connect remotely" switch.

## Decision

- A new package, `@deepseek-ai/dsh-client-ui-sdkwork-mobile-connect`, registers one cell in `mode.rail.panel` at order 15: IM connector (10), this shortcut (15), message center (20), Settings. The cell is presentation only — it selects no center panel, so it never competes with a panel shortcut's selected state — and reuses the shared `remote-connection-outline` glyph instead of adding artwork.
- Hovering the cell opens a compact `HoverCard` after a 140ms dwell; activating it opens the same body in a `Modal`. One component renders both, because a hover-only affordance is unreachable from the keyboard and from touch (the hover card itself ignores touch pointers). The card asks the primitive for a 304px width through a new `width` prop — the compact default stays 244px — because its two destination tabs, its caption, and its QR plate do not fit the default without wrapping; the primitive caps that width to the viewport on narrow windows.
- The card is the product's two scanned destinations plus one durable switch. Destinations are the namespace's `appDownloadUrl` and `miniProgramUrl`; the switch is `remoteAccessEnabled`. All three are volatile fields of the `ui-sdkwork-mobile-connect` settings namespace, read and written through `ctx.configForms`, so two windows and a reload agree.
- The Host half exists only to declare that namespace (`Config`) and to keep its generated settings page off (`settings.configure({ auto: false })`): the card is the only surface that reads it, and a second generated copy would be a differently shaped duplicate.
- The scan plate is a fixed light artifact. The QR encoder needs concrete colors, so the artifact pair lives beside the encoder in the component and reaches the stylesheet as two local properties; the plate does not follow the theme and the symbol is never drawn inverted. Inside the hover card the card remaps the semantic aliases it hands to `SegmentedTabs` and `Switch` (`--dsw-alias-label-*`, `--dsw-alias-bg-module-platform`, `--dsw-alias-bg-layer-3`, `--dsw-alias-border-l3`) so the shared controls keep their own geometry, roles, and keyboard behavior on the hover-card material.
- States: a bare spinner while the section syncs, the code when the selected destination is non-empty, an unconfigured notice (plus the hint that a deployment address fills it) for an empty or unserved destination, and a refusal line when a switch write comes back rejected. The switch disables itself while the section is not writable.

## Alternatives considered

**Fold the entry into the message center's card.** The message center already owns a rail cell and a badge; giving the same icon a second, unrelated capability would make one icon mean two things and hide the device surface behind a notification surface.

**Reuse the remote-connection settings section instead of adding a shortcut.** Settings already exposes the advertised address, the QR login ticket, and pairing approval, but those are owner-facing configuration surfaces behind the settings dialog. The requested surface is a one-glance scan path from the rail, so it is a separate shortcut that opens no settings section.

**Enforce "allow mobile devices to connect remotely" in the Host now.** The switch persists and renders today; making it gate remote access needs the Host's remote-access admission to read the same field. Shipping a UI gate before that path exists would claim a guarantee the Host does not make, and would change remote-access behavior without the product defining its scope. The field is the seam, and the package README records the gap.

**Draw a desktop-plus-phone glyph for the cell.** The supplied reference shows one, but the icon contract requires designer approval for new glyphs and the existing `remote-connection-outline` already states the meaning; reuse keeps this change inside the shared artwork policy.

**Show the card only on hover.** Rejected: hovering is unavailable to keyboard users and is ignored for touch pointers, so the dialog path is what makes the same destinations and switch reachable for everyone.

## Consequences

- The switch is a durable preference, not yet an enforcement point. Turning it off changes the stored value, the rendered switch, and nothing about who may connect. The package README's Known Limitations section and the field's own documentation state that, and the Host admission path is where enforcement lands.
- Scan destinations are deployment configuration. An empty destination renders the unconfigured state rather than a QR code for a guessed page, and changing one means writing the profile entry — the namespace deliberately exposes no generated settings page.
- The rail position is fixed at 15. A panel shortcut is not part of the rail's customize dialog, so the user can neither move nor hide the cell; moving it is an edit to this registration.
- The scan artifact pair is the only intentional bypass of theme aliases in this package. It is not a literal in a stylesheet, so the theme's color gate still holds, and the plate renders identically in light and dark themes.
- `qrcode.react` is bundled privately into this package's browser chunk; nothing else in the client can import it through this package.

## Verification

Three spec files (16 cases) pin the surface: the card's destinations, tab switching, QR accessible names, the switch write and its refusal line, the loading and unconfigured states, and the dialog material; the rail cell's label, hover card, dialog activation, and unresolved-section silence; and the apply wiring's order 15, injected face, refused-write containment, and teardown. The neighbouring packages (ui-primitives, ui-sdkwork-app-modes, ui-sdkwork-message-center, ui-sdkwork-im-connector) pass with the new row registered, and the theme style gates report no violation in this package.
