# Agent Note: Chat failure-row credential fixes

Status: implemented

English | [中文](2026-11-19-chat-credential-fixes.zh.md)

## Problem

A Turn that fails with `MISSING_CREDENTIAL` states the repair as prose: sign in — the relay then uses the signed-in Auth Token — or store the provider key on Settings → Models. The user has to find the settings-menu sign-in row and then the Models page, and the page gives no pointer to the provider whose credential just failed.

## Decision

- Chat splits the missing-credential sentence into fragments around two session-scoped repair seats, `conversation.chat.turn-error.sign-in` and `conversation.chat.turn-error.model-settings`, declared by the `turn-error` keyed node renderer. Each seat receives the stable failure code and the localized label phrase the sentence already carries; Chat renders the label itself when a seat has no registrant, so the row reads as one plain sentence without the feature and every locale keeps one sentence.
- The SDKWork IAM plugin fills both seats and answers `MISSING_CREDENTIAL` alone. Sign in calls `ctx.iam.openSignInOverlay()` — the product entry modal — and degrades to plain text while a session is held (through an injected `signedIn` hook), since the relay then already has its token; the Models phrase calls `ctx.settingsMenu.openSection('models', { focusProvider: 'birdcoder' })`. Rendering nothing for another failure leaves the row's copy untouched.
- The settings shell moves its dialog visibility and active section from component-local state into a declared `mode.rail.settings` store, adds a reveal target to that state, and provides `ctx.settingsMenu.openSection(id, { focusProvider })` over the same instance the registration renders. The service interface lives with the shell's contract.
- The shell hands the reveal target to a section through the settings section owner share (`focusProvider`), so each feature section decides what revealing means. The Models section scrolls the named provider's card into view, marks it briefly, and ignores unknown or not-yet-loaded routes. Manual navigation and close clear the target, so a plain visit keeps the page's own starting position.

## Alternatives considered

**A separate action row under the sentence.** Rendered fixes as two extra buttons after the copy. It splits the same instruction into prose plus a control strip, repeats the labels, and reads as an afterthought in the transcript; inline links keep the sentence the single instruction it already was.

**Put each action where its dependency lives.** The Models action could sit in the settings-shell package, which owns the store, but the sign-in gesture belongs to the IAM package. Two seats keep each gesture with its owner while the copy stays in Chat, and the row passes the localized label so no second dictionary enters the picture.

**Route the configure gesture through a DOM query or a URL fragment.** Neither is typed, disposable, or testable through the plugin seams; a Cordis service is the sanctioned cross-plugin channel, and here it can hand out the same store instance the shell renders.

**Open Settings → Models without naming a provider.** Card order changes as the user configures providers, so "locate the BirdCoder card" needs an explicit target rather than assuming the first row.

## Consequences

- Chat's failure row gains two named seats and keeps all of its copy: eight locale dictionaries carry the sentence as five fragments (before, sign-in label, between, Models label, after), and the fallback renders those labels as plain text.
- `ctx.settingsMenu` is optional. A composition without the settings shell still mounts both IAM seats; the Models click is inert because `ctx.get('settingsMenu')` resolves nothing, and there is no Models page to open in that composition either.
- The reveal target is ephemeral store state. Reopening Settings from the menu, or selecting another section, does not repeat the scroll or the highlight.
- The IAM package now carries a type-only `devDependency` edge on `@deepseek-ai/dsh-client-ui-chat` for the seat declarations and their owner props.

## Testing

- `ui-chat`: the Chat view spec renders both registered links at their sentence positions with the failure code and the localized labels, and its unregistered case keeps the full sentence as plain text; the apply spec pins the two child declarations and the row's inject-free face.
- `ui-sdkwork-iam`: the component spec covers each link's dispatch, the signed-in degradation of the sign-in phrase, and inertness for other codes; the stylesheet spec asserts the links paint with the theme's `--dsw-alias-link` alias and name only declared theme variables, so the presentation holds in both themes; the apply spec registers both seats on the real slot registry and asserts the sign-in dispatch plus the missing-service configure path.
- `ui-sdkwork-settings-menu`: the root spec covers deep-link opening with the reveal target and its clearing on manual navigation and close; the apply spec asserts the service drives the same store the registration exposes.
- `ui-settings-models`: the component spec stubs `scrollIntoView`, asserts the named card is scrolled and marked, and that an unknown route leaves the page unmarked.
