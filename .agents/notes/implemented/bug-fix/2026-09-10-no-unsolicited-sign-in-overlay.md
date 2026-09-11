# Agent Note: No unsolicited sign-in overlay

Status: implemented

English | [中文](2026-09-10-no-unsolicited-sign-in-overlay.zh.md)

## Problem

The code workbench answered ordinary work with a login dialog. Clicking 媒体创作 in the new-session hero — a scene whose destination is the account-bound Video mode — staged the scene and opened the modal sign-in overlay on the same click, before any message existed. Submitting the first message did it again: the hero's submission observer switched the frame through `requestAuthenticatedMode`, which opens the overlay, and the destination page opened it a third time when it mounted unsigned. The mode rail repeated the pattern one step away: switching to a gated mode pre-opened the overlay before the page appeared. A pill click, a send, or a mode switch is not a request to sign in, and a dialog that arrives as a side effect of ordinary work reads as the workbench demanding an account.

## Decision

A sign-in surface opens only from an explicit sign-in gesture. Two gestures remain: the settings menu's 登录 / 注册 row (`IamService.openSignIn`, modal or account page per the `presentation` setting) and the sign-in button on a gated mode page's signed-out notice (`AuthenticatedModeShell`). Every other path stages or navigates without touching the gate:

- `HeroModeSwitch`'s injected face is the staging store alone; a pill click writes `scene.set`.
- The hero's submission observer switches the frame with `ctx.layout.setMode(staged)`, and `ui-sdkwork-app-modes` declares no `iam` service edge at all.
- `ModeRail` hands its owner `setMode` through untouched.
- `AuthenticatedModeShell` renders the signed-out notice and never opens the overlay itself; it mounts its children only after IAM reports signed in.

`ui-sdkwork-iam` drops the mode-gate vocabulary the removed paths used — `AUTHENTICATED_APP_MODES`, `AuthenticatedAppModeId`, `isAuthenticatedAppMode`, `requestAuthenticatedMode`, and the `IamService.requestAuthenticatedMode` delegate. The surviving seam is `injectAuthenticatedModePage` plus `AuthenticatedModeGate`, which a gated page uses for its signed-in state and its own sign-in button.

This reverses the staging-time overlay and the authenticated submission switch in [the hero scene-switcher decision](../feature/2026-09-08-sdkwork-hero-scene-switcher-and-document-mode.md) and the overlay-on-entry consequence in [the markets public-mode decision](../architecture/2026-09-06-sdkwork-markets-public-mode.md). Both notes retain their own decisions: the hero seat, staging store, submission navigation, skill-tag strip, and Document placeholder; markets' public-page contract.

## Alternatives considered

**Keep the staging-time prompt and soften it (a badge or a notice under the pills).** Rejected: the requirement is that no code-surface operation raises the overlay, and a pill click is not a commitment to the scene.

**Leave the rail's prompt in place and fix only the submission path.** Rejected as a half rule: a rail switch, an implicit frame change from a submission, and a page mount are all navigation, and the same dialog arriving one step later is the same interruption. One rule — explicit gestures only — is what each surface can state and the tests can pin.

**Withhold the submission navigation for a gated scene while signed out.** Rejected: the staging would then do nothing visible and the first message would land with its scene dropped. The frame still navigates, and the destination page states the requirement in place.

**Mount the gated pages anonymously instead of showing the notice.** Rejected: those SDKWork pages need the session for their own requests, and the notice is what keeps them from running anonymous SDK traffic.

## Consequences

Staging 媒体创作 or 文档生成 holds the conversation on the Code page with the pill highlighted; the first submitted message lands the frame on that scene's mode page, and a page that needs a session shows its signed-out notice with a 登录 button. Switching to a gated mode from the rail behaves the same way: the page states the requirement instead of a dialog appearing over it. A signed-out user therefore meets the account requirement when the gated surface is on screen, never while choosing a scene or leaving one, and no code-surface interaction can interrupt with a dialog. `ui-sdkwork-app-modes` loses its IAM dependency edge, and `ui-sdkwork-iam` loses its mode-list vocabulary and the rail's dispatch helper.

## Testing

`hero-mode-switch.client.spec.tsx` renders the switcher with staging as its only effect. `apply.client.spec.ts` pins the plugin's service list without `iam`, a rail registration that carries no inject face, the staging-only hero face, and a signed-out gated staging that navigates while the bench gate's overlay stays untouched. `mode-rail.client.spec.tsx` pins the rail's untouched pass-through of the owner switch. `authenticated-mode-shell.client.spec.tsx` pins the shell: mounting signed out renders the notice and opens nothing, the notice's button opens the overlay, and a signed-in gate mounts the page. `ui-sdkwork-markets`' page specs keep the gate-free public page.
