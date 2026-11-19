# Agent Note: Chat failure-row credential fixes

Status: implemented

English | [中文](2026-11-19-chat-credential-fixes.zh.md)

## Problem

A Turn that fails with `MISSING_CREDENTIAL` states the repair as prose: sign in — the relay then uses the signed-in Auth Token — or store the provider key on Settings → Models. The user has to find the settings-menu sign-in row and then the Models page, and the page gives no pointer to the provider whose credential just failed.

## Decision

- Chat declares one new session-scoped list seat, `conversation.chat.turn-error.actions`, on the `turn-error` keyed node renderer. The row hands each registrant only the stable failure code; Chat keeps no provider-specific repair logic, and with no registrant the row renders exactly as before.
- The SDKWork IAM plugin registers the single `credential-fixes` entry and answers `MISSING_CREDENTIAL`: **Sign in** calls `ctx.iam.openSignInOverlay()` — the product entry modal — and is hidden while a session is held, through an injected `signedIn` hook; **Configure** calls `ctx.settingsMenu.openSection('models', { focusProvider: 'birdcoder' })`.
- The settings shell moves its dialog visibility and active section from component-local state into a declared `mode.rail.settings` store, adds a reveal target to that state, and provides `ctx.settingsMenu.openSection(id, { focusProvider })` over the same instance the registration renders. The service interface lives with the shell's contract.
- The shell hands the reveal target to a section through the settings section owner share (`focusProvider`), so each feature section decides what revealing means. The Models section scrolls the named provider's card into view, marks it briefly, and ignores unknown or not-yet-loaded routes. Manual navigation and close clear the target, so a plain visit keeps the page's own starting position.

## Alternatives considered

**Put each action where its dependency lives.** The configure action could sit in the settings-shell package, which owns the store, but the sign-in gesture belongs to the IAM package. One contribution keeps the two links on one row with one style and lets the IAM package gate the sign-in on the session it owns.

**Route the configure gesture through a DOM query or a URL fragment.** Neither is typed, disposable, or testable through the plugin seams; a Cordis service is the sanctioned cross-plugin channel, and here it can hand out the same store instance the shell renders.

**Open Settings → Models without naming a provider.** Card order changes as the user configures providers, so "locate the BirdCoder card" needs an explicit target rather than assuming the first row.

## Consequences

- Chat's failure row gains an extension seat: any feature can add fixes for a failure code it owns, and the row's existing copy is unchanged.
- `ctx.settingsMenu` is optional. A composition without the settings shell still mounts the IAM entry, and its configure click is inert because `ctx.get('settingsMenu')` resolves nothing; there is no Models page to open in that composition either.
- The reveal target is ephemeral store state. Reopening Settings from the menu, or selecting another section, does not repeat the scroll or the highlight.
- The IAM package now carries a type-only `devDependency` edge on `@deepseek-ai/dsh-client-ui-chat` for the seat declaration and its owner props.

## Testing

- `ui-chat`: the Chat view spec renders a registered fix with the failure code and keeps the unregistered row text unchanged; the apply spec pins the new child declaration and the row's inject-free face.
- `ui-sdkwork-iam`: the component spec covers both links, the signed-in hiding of Sign in, and inertness for other codes; the apply spec registers the entry on the real slot registry and asserts the sign-in dispatch plus the missing-service configure path.
- `ui-sdkwork-settings-menu`: the root spec covers deep-link opening with the reveal target and its clearing on manual navigation and close; the apply spec asserts the service drives the same store the registration exposes.
- `ui-settings-models`: the component spec stubs `scrollIntoView`, asserts the named card is scrolled and marked, and that an unknown route leaves the page unmarked.
