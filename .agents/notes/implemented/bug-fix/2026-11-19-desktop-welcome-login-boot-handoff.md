# Agent Note: The startup welcome login boots the preloaded workspace before running the browser login

Status: implemented

English | [中文](2026-11-19-desktop-welcome-login-boot-handoff.zh.md)

## Problem

The welcome window's 登录 action is the product entry for the SDKWork IAM browser login ([decision](../feature/2026-11-04-unified-login-surface.md)). The shell delivered it by setting a one-shot `__DSH_IAM_SIGN_IN__` value on the workspace's boot response and then entering the workspace, where the IAM service consumes it and starts the hosted authorization page.

That delivery assumed the workspace boots *after* the welcome hands off. It does not: `reconcileBackend` navigates the hidden main window to `dsh-app://app/` before starting the Host, exactly so the document can load while the backend readies, and `openInitialWindow` decides between welcome and workspace only after the Host answers. On a signed-out launch that means the document's `dsh-app://app/` boot response is already answered before the welcome page appears. `enterWorkspace` joined the cached navigation instead of loading the document again, so the boot handler that reads the one-shot value never ran again. Clicking 登录 closed the welcome window, revealed the already-loaded workspace, and started nothing: no system browser page, no hand-off card, no error.

The same boot ordering left a second gap behind the first. `IamService.attachModal` was called during plugin apply with wrappers that forwarded to the overlay store's bound actions, but those actions exist only after the overlay entry renders. A launch request consumed during apply could therefore open the browser while `openBrowser` was dispatched into an unbound wrapper and dropped — the hand-off card never appeared. A failed cold-start deep-link callback had the same fate.

## Decision

The handoff now reaches the document that already booted, and the surface it needs exists before the request is presented.

- **A forced boot carries the request.** `navigateMain(url, reload)` starts a fresh document load instead of joining the matching cached navigation, and `enterWorkspace({ reload })` forwards it. The welcome's startup `iamSignIn` marks `pendingIamSignIn` and enters the workspace with `reload: true`; the reloaded document's boot response carries `__DSH_IAM_SIGN_IN__`, and the IAM service starts the configured login gesture with its hand-off card. The in-workspace sign-in page (`welcomePurpose === 'sign-in'`) keeps resolving `'login'` without a reload, because there the running renderer starts the login itself and must keep its surface state.
- **The page cannot repeat the handoff.** The welcome renderer holds a starting ref across the click and marks the entry's Sign in action busy with its opening copy, so a second click while the reload is in flight is ignored and the page says what it is doing; a rejected handoff clears the ref so the action can be retried.
- **The service presents once the host mounts.** `IamService.attachModal` takes the overlay's real bound actions from the entry's inject factory, deferred one microtask past render so a store write never lands in React's render phase, and it is no longer called at apply with forwarding wrappers. The configured gesture does not wait for that mount ([later decision](2026-11-22-deeplink-callback-recovery.md)): a request recorded before the first render starts the login immediately, and the mount attaches the actions and presents the attempt it was missing.

## Alternatives considered

**Send a runtime IPC instruction to the live workspace instead of reloading.** It avoids the boot, but it needs a new preload method, a renderer listener, and a queue for the request that arrives before the plugin mounted; the one-shot boot value already is that contract.

**Move the workspace preload after the welcome decision.** The signed-out launch would then boot the document once with the value and need no reload, but the ordinary signed-in launch would lose the document that the shell loads while the Host readies, which is the startup behavior the preload exists for.

**Hold the boot response until the welcome resolves.** Startup would await a user gesture, and the Host readiness promise is also joined by updates and recovery, so a welcome left open would block work that has nothing to do with it.

**Keep the apply-time wrappers and add a `modalMounted` flag.** The service would hold two readiness notions for the same surface, and every presentation path would still need to know whether the actions were live; letting `attachModal` mean "the actions exist" removes that state.

## Consequences

The initial 登录 click now reaches the hosted authorization page and shows the hand-off card that waits for the deep link, so the launch entry and the in-workspace sign-in page end in the same surface. The cost is one extra boot of the document the launch already preloaded; it happens behind the welcome page, and the document holds no state worth preserving at the entry (a signed-out launch or a just-signed-out workspace). The IAM service has no card until the overlay entry renders, the same point at which a user can see or click anything; a boot-time request starts the login at once and presents its card at that mount, so the request is neither dropped nor blocked by a missing surface. The desktop welcome README and the IAM package README state both effects. The desktop welcome README and the IAM package README state both effects.

## Verification

`apps/desktop/tests/welcome-startup.spec.ts` adds a startup case that asserts the launch preloads `dsh-app://app/` once, then that the welcome's `iamSignIn` loads it a second time and that its boot handler returns the `__DSH_IAM_SIGN_IN__` global. `apps/desktop/tests/welcome-renderer.client.spec.tsx` pins the repeated-click guard. `packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` pins that the welcome request starts the hosted login before the sign-in host mounts and that the mount presents the attempt already in flight. On the desktop `--online` development lane, rebuilding the IAM client bundle and reloading the workspace with the boot value set produced a new PKCE flow in `sdkwork.iam.desktopAuthFlow.v1` and the `已在浏览器中打开登录页` card, which the pre-fix bundle did not show.
