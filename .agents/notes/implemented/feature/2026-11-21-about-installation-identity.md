# Agent Note: The About surface reads its installation identity from the App API

Status: implemented

English | [中文](2026-11-21-about-installation-identity.zh.md)

## Problem

The desktop shell's About entry showed a native message box with the product name and the executable version, and the settings dialog had no About page at all. Neither surface could answer the questions an About panel exists for: which application is this, which installation does my access token belong to, and which product identity was frozen when it was installed. The client already carries the deployment profile (`ui-sdkwork-env`: gateway origin, public application access token, declared app id), and the platform verifies that token server-side, but no App API operation published the resulting installation identity. Computing it in the browser — decoding the token and trusting its claims for display — would make the page disagree with whatever the gateway actually accepted.

## Decision

The About surface is one product page rendered in two framings: a `settings.section` (id `about`, order `1000`, after every feature page) inside `ui-sdkwork-settings-menu`, and a `shell.overlay` dialog the desktop application menu's About command opens through a new `ctx.about` service. Both render the same `AboutContent`, so the settings page and the app menu cannot drift into two designs.

The identity comes from a new App API read, `GET /app/v3/api/installation` (`installation.retrieve`, dual-token, no extra permission). Two independent crates own it: `sdkwork-birdcoder2-installation-service` holds the domain projection (release scope resolved from the signed claim or its legacy derivation, lifecycle environment, deployment mode, and the product slice), and `sdkwork-routes-birdcoder2-installation-app-api` projects the verified `WebRequestContext` onto that domain and the platform envelope. The product profile is assembly-supplied configuration; the shipped default is the BirdCoder identity from `agent.app.config.json`.

The generated TypeScript transport (`sdks/sdkwork-birdcoder2-app-sdk`) gains the operation through the canonical generator from the updated OpenAPI authority. `ui-sdkwork-about` builds that client in its apply closure with the `ui-sdkwork-env` profile, re-validates the response at the wire boundary, and shows localized local facts (build version, commit, declared app id, gateway origin) with a notice plus retry when the read cannot complete.

The desktop About command moved to `apps/desktop/src/about-command.ts`: `sdkwork:about:open` announces the command on the renderer and `sdkwork:about:takePending` lets a page that mounted after the click consume it once. `iam-preload.ts` exposes both under the existing `window.sdkworkDesktop` bridge, so the desktop shell adds one slice to a preload surface rather than a second bridge.

## Alternatives considered

**A standalone Electron About window.** It would need its own HTML/CSS/JS, its own copy dictionaries, and its own access to the deployment token, which the main process does not carry; the page already has all three. The in-app dialog also keeps the settings page and the menu entry on one rendering path.

**Reading the identity from the access token in the browser.** The token's claims are visible to the page, but a client-side decode cannot know whether the gateway accepted that credential, and it would duplicate the release-scope derivation and its legacy fallback. The route reads the verified context instead.

**Folding the route into `sdkwork-routes-birdcoder2-app-api`.** The surface already existed, but the installation identity is a separate capability with its own service; keeping it in its own pair of crates lets the person-scoped relay evolve without touching About's contract, and the API assembly mounts both.

## Consequences

The About page can now show a registered app id that is authoritative because the platform resolved it, and it degrades honestly: an IAM-session-only launch carries no static token and says so instead of guessing. The cost is a second route crate and an assembly dependency on the installation service, plus a client bundle that inlines the generated SDK (about 139 kB uncompressed including `@sdkwork/sdk-common`).

The About dialog no longer exists on any platform as a native panel; macOS keeps `setAboutPanelOptions` for OS-level About surfaces but the application menu routes to the page. A future installation identity that needs more than the product slice extends the service crate and the OpenAPI authority, regenerates the SDK, and the About page picks the fields up — it never learns a second app-id source.
