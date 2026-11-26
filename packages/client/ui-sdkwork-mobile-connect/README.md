---
description: "Mobile connection surface: the rail shortcut directly above the message center and the scan card it shows on hover or as a dialog — mobile App / WeChat mini-program destinations plus the durable allow-remote-connection switch."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mobile-connect

English | [中文](README.zh.md)

## Summary

The mobile connection surface: one icon cell in the mode rail's panel-shortcut seat, directly above the message center, and the card it shows — the mobile App destination, the WeChat mini-program destination, each as a QR code, and the switch that records whether this installation allows remote connections from mobile devices.

## Table of Contents

- [Understand the implementation](#understand-the-implementation)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Understand the implementation

The cell occupies `mode.rail.panel` with order 15, so the rail's bottom cluster reads IM connector (10), this shortcut (15), message center (20), Settings. The cell is presentation only: it selects no center panel, carries no selection state, and reuses the shared `remote-connection-outline` glyph rather than introducing artwork. Hovering the cell opens a `HoverCard` (compact variant, 140ms dwell) whose body is the scan card; activating the cell opens the same body in a `Modal`, which is the keyboard and touch path — the hover card itself ignores touch pointers and never opens from focus.

The card is one component with two material variants. Inside the hover card it inherits the primitive's hover-card material and remaps the semantic aliases it hands to `SegmentedTabs` and `Switch` (`--dsw-alias-label-*`, `--dsw-alias-bg-module-platform`, `--dsw-alias-bg-layer-3`, `--dsw-alias-border-l3`), so the shared controls keep their own geometry, roles, and keyboard behavior on a dark surface. Inside the dialog it renders the page material as an independent child card. The QR sits on its own light plate in both variants: a scan symbol needs near-black modules on white, so the plate takes the static neutral pair (`--dsw-static-neutral-bluish-00` / `-1000`) and never follows the theme. The product favicon is embedded in the symbol's centre at error-correction level `H`, so the excavated hole stays recoverable.

States the card renders: a bare spinner while the settings section is still syncing, the code once the section resolves with a non-empty destination, an unconfigured notice (with the hint that a deployment address fills it) when the destination is empty or the namespace is unserved, and a refusal line when the switch write comes back rejected. The switch disables itself while the section is not writable.

## Configuration

This package owns the `ui-sdkwork-mobile-connect` settings namespace; its Host half declares the `Config` schema and turns the generated settings page off, because the card is the only surface that reads it. Fields (all volatile, so the browser sees live updates):

| Field | Default | Meaning |
| --- | --- | --- |
| `remoteAccessEnabled` | `true` | The switch's durable value. |
| `appDownloadUrl` | `https://sdkwork.com/apps/sdkwork-birdcoder2` | Page the App tab's QR code opens. |
| `miniProgramUrl` | `https://sdkwork.com/apps/sdkwork-birdcoder2-mini-program` | Page the mini-program tab's QR code opens. |

A deployment overrides them in its profile's Cordis patch under the `ui-sdkwork-mobile-connect` entry. The browser half reads the resolved section through `ctx.configForms` and writes the switch back through the same scope, so a reload and a second window agree.

## Model Experience

None, as the package is human-only surface chrome and one boolean preference: it opens no session, reaches no model request, and injects nothing into a prompt.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The switch is a durable preference, not yet an enforcement point** — `remoteAccessEnabled` is stored, mirrored, and rendered, but no Host authorization path reads it yet: a mobile device that can already reach this Host stays able to connect while the switch is off. Enforcement belongs to the mobile-connection capability (the Host's remote access admission), and this field is the seam it will read.
- **Scan destinations are deployment configuration** — the card shows an unconfigured notice for an empty destination and offers no in-app editor; changing a destination means writing the profile entry, because the namespace's generated settings page is deliberately off.
- **One card per deployment brand** — the symbol's centre mark is the product favicon the Web shell already serves, so an OEM deployment that replaces the favicon gets its own mark with no code change, but a deployment cannot choose a different mark per destination.
- **The rail position is fixed** — 15 keeps the cell between the IM connector and the message center; unlike a mode entry, a panel shortcut is not part of the rail's customize dialog, so the user cannot move or hide it.
