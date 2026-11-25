# Agent Note: The About surface reads its installation identity from the App API

Status: implemented

English | [中文](2026-11-21-about-installation-identity.zh.md)

## Problem

The desktop shell's About entry showed a native message box with the product name and the executable version, and the settings dialog had no About page at all. Neither surface could answer the questions an About panel exists for: which application is this, which installation does my access token belong to, and which product identity was frozen when it was installed. The client already carries the deployment profile (`ui-sdkwork-env`: gateway origin, public application access token, declared app id), and the platform verifies that token server-side, but no App API operation published the resulting installation identity. Computing it in the browser and trusting its claims as the answer would make the page disagree with whatever the gateway actually accepted.

## Decision

The About surface is one product page rendered in two framings: a `settings.section` (id `about`, order `1000`, after every feature page) inside `ui-sdkwork-settings-menu`, and a `shell.overlay` dialog the desktop application menu's About command opens through a new `ctx.about` service. Both render the same `AboutContent`, so the settings page and the app menu cannot drift into two designs.

The identity comes from a new App API read, `GET /app/v3/api/installation` (`installation.retrieve`, dual-token, no extra permission). Two independent crates own it: `sdkwork-birdcoder2-installation-service` holds the domain projection (release scope resolved from the signed claim or its legacy derivation, lifecycle environment, deployment mode, and the product slice), and `sdkwork-routes-birdcoder2-installation-app-api` projects the verified `WebRequestContext` onto that domain and the platform envelope. The product profile is assembly-supplied configuration; the shipped default is the Birdcoder identity from `agent.app.config.json`.

The generated TypeScript transport (`sdks/sdkwork-birdcoder2-app-sdk`) gains the operation through the canonical generator from the updated OpenAPI authority. `ui-sdkwork-about` builds that client in its apply closure with the signed-in IAM session credentials, re-validates the response at the wire boundary, and shows localized local facts (build version, commit, gateway origin) with a notice plus retry when the read cannot complete.

Each application mode registers its own deploy application, and the build materializes that mode's anchor into `SDKWORK_APP_ID`; `ui-sdkwork-env` projects it into the profile's `appId` so the client names the same installation the page build targeted. The About page reads with the signed-in IAM session's `authToken`/`accessToken` pair, the same dual-token credential the app-api expects, so the platform verifies both halves before answering. The registered app id row shows only the platform's answer: the build's anchor and any local token claim stay deployment facts, a busy row covers the read, and `未获取` covers an unreachable or signed-out run. The vendor and product key fall back to the shipped identity (`SDKWORK`, `birdcoder`). A page whose client bundle carries no build version takes the desktop shell's installed version through a small About facts bridge. A production environment hides the deployment card, so the release surface shows only the product identity and the product links.

The desktop About command moved to `apps/desktop/src/about-command.ts`: `sdkwork:about:open` announces the command on the renderer and `sdkwork:about:takePending` lets a page that mounted after the click consume it once. `iam-preload.ts` exposes both under the existing `window.sdkworkDesktop` bridge, so the desktop shell adds one slice to a preload surface rather than a second bridge.

## Alternatives considered

**A standalone Electron About window.** It would need its own HTML/CSS/JS, its own copy dictionaries, and its own access to the deployment token, which the main process does not carry; the page already has all three. The in-app dialog also keeps the settings page and the menu entry on one rendering path.

**Reading the identity from the access token as the authoritative source.** A client-side decode cannot know whether the gateway accepted the credential, and it would duplicate the release-scope derivation and its legacy fallback. The About page therefore reads only after the platform has verified both token halves, and only the response decoder's vocabulary becomes the registered app id; a locally decoded claim never does.

**Folding the route into `sdkwork-routes-birdcoder2-app-api`.** The surface already existed, but the installation identity is a separate capability with its own service; keeping it in its own pair of crates lets the person-scoped relay evolve without touching About's contract, and the API assembly mounts both.

## Consequences

The About page can now show a registered app id that is authoritative because the platform resolved it from the signed-in session, and it degrades honestly: a signed-out launch carries no credential pair and says so instead of guessing or showing a local anchor. The cost is a second route crate and an assembly dependency on the installation service, plus a client bundle that inlines the generated SDK (about 139 kB uncompressed including `@sdkwork/sdk-common`).

The read now depends on the IAM session: while signed out the row stays `未获取`, and a deployment whose app-api is not published shows the failure notice. The registered id is one created installation per tenant, owner, and application — the deploy application id is unique in the platform — so the verified response can never name a different installation. The product links open the BirdCoder site at `www.birdcoder.com`; the support, privacy, and terms destinations live under `/docs/`, and the documents service seeds those pages for tenant 100001 on boot, so `/docs/{slug}` resolves after a fresh installation without an operator publishing anything.

The per-mode identity depends on the packaging lane exporting that mode's anchor: the desktop lane does, while a source `desktop:dev` run reports the build's web anchor until the platform answers. A user settings document can still override the profile and pin an older app id; the environment projection is a deployment default, not an enforced identity.

The About dialog no longer exists on any platform as a native panel; macOS keeps `setAboutPanelOptions` for OS-level About surfaces but the application menu routes to the page. A future installation identity that needs more than the product slice extends the service crate and the OpenAPI authority, regenerates the SDK, and the About page picks the fields up — it never learns a second app-id source.
