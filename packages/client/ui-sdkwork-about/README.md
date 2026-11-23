---
description: "SDKWork 关于 (About) plugin: the settings section and desktop dialog presenting the product mark, build version, the installation's registered app id, and the application identity the BirdCoder2 App API resolves from the signed-in session credentials."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-about

English | [中文](README.zh.md)

## Summary

SDKWork 关于 (About) plugin: one settings section (id `about`, order `1000`, after every feature page) and one `shell.overlay` dialog that render the same product page — the BirdCoder mark, the client build version, the installation's registered app id, the deployment identity the platform verified, and the product links. The desktop application menu's About command opens the dialog through the `ctx.about` service, so the native menu and the settings page reach one About design. The installation read is `GET /app/v3/api/installation` through the generated `@sdkwork/birdcoder2-app-sdk` client, authenticated with the signed-in IAM session's `authToken`/`accessToken` pair (dual-token).

## Table of Contents

- [Surface](#surface)
- [Data](#data)
- [Installation identity](#installation-identity)
- [Desktop About command](#desktop-about-command)
- [Implementation notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Surface

The plugin registers one `settings.section` contribution, one `shell.overlay` dialog, and the `ctx.about` service:

- **Nav row `关于`** (`settings.section`, id `about`, order `1000`): the settings panel's last nav entry. `ui-sdkwork-settings-menu` draws the rail's info glyph for the known id.
- **The page body**: a hero (mark, product name, version chip, tagline, platform-read status, refresh action), an application card (version, registered app id, product key, vendor), a deployment card (application mode, deploy app id, environment, deployment mode, release scope, tenant, organization when organization-scoped, API endpoint, commit), a links card (website, support, privacy, terms), and the copyright line. The version, registered app id, API endpoint, and commit values are click-to-copy: the value reads as plain text, shows a pointer and underline on hover, and briefly shows the copied label after a successful write.
- **The dialog**: the same content in compact framing, portaled to the document body, dismissable by the close button, mask click, Escape, or the confirm action.

## Data

Local facts come from the client build (`DSH_CLIENT_VERSION`, `DSH_CLIENT_COMMIT_HASH`, `DSH_CLIENT_GIT_DIRTY`), the ui-sdkwork-env profile (gateway origin, environment, declared deploy anchor), the presence of the desktop preload bridge (application mode: desktop or web), and, for a page whose client bundle carries no build version, the desktop shell's installed version through the About facts bridge. The platform read returns the installation's deploy application id, tenant, organization scope, release scope, lifecycle environment, deployment mode, and the product slice frozen at install time; `decodeInstallationApplication` re-validates that wire response before any component reads it.

The registered app id row shows only the platform's answer. A local token claim or the build's deploy anchor never stands in for it; while the read runs the row is busy, and without an answer it reads `未获取`. A signed-out launch has no credential pair to read with, so the surface shows the sign-in notice instead of guessing. The vendor and product key rows fall back to the shipped identity (`SDKWORK`, `sdkwork-birdcoder2`) because they describe the published product, not the installation. The shipped product links and the server-side product profile point at the `birdcoder.com` site: the website at the origin and the support, privacy, and terms pages under `/docs/`.

The runtime owns both snapshots as stable observables. A refresh keeps settled facts on screen while it runs; a failed or incomplete read renders the localized notice with the technical detail behind a disclosure, and the local facts stay visible.

## Installation identity

The signed session credential names the installation: the platform verifies both token halves and resolves `WebRequestContext`, and the route projects that verified identity rather than trusting a client-supplied app id. This is why the About page shows the registered app id from the response and never from the settings document or a local token decode.

Each application mode registers its own deploy application (the repository's `.env` records one anchor per surface, and the packaging lanes inject the matching `SDKWORK_DEPLOY_APPLICATION_ID`). The page build materializes that anchor into `SDKWORK_APP_ID`, `ui-sdkwork-env` projects it into the profile's `appId`, and the About page reports the mode in its application-mode row. The platform keeps one installation per tenant, owner, and application (its deploy application id is unique), so the verified response always names that one created installation. A signed-out launch renders the sign-in notice; the status pill distinguishes the platform answer from local facts.

## Desktop About command

`apps/desktop/src/about-command.ts` owns the `sdkwork:about:open` / `sdkwork:about:takePending` channels; `iam-preload.ts` exposes them under `window.sdkworkDesktop.about`. The application menu entry runs `aboutCommand.show()`, which focuses the workspace window and announces the command; a click that arrives before the page listens stays pending and is consumed once when this plugin mounts.

## Implementation notes

- The plugin is gated on the `env` and `iam` Cordis services (`inject`), so a composition without `ui-sdkwork-env` or `ui-sdkwork-iam` leaves it pending rather than reading an unconfigured endpoint or an unauthenticated session.
- The SDK client is constructed in the apply closure, never in a component; the response is narrowed at the wire boundary and the components receive plain data through the injected face.
- The dialog's visibility lives in a declared store created once in `apply`, so the service and the rendered dialog cannot disagree.

## Dev Note

The installation read is the only network call; the plugin renders the verified identity and never caches a deployment fact in the browser.

## Model Experience

None, as the About surfaces are browser-side product identity UI; they neither assemble nor send model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Signed-in read only** — the read uses the IAM session's credential pair; a signed-out launch has nothing to authenticate with and shows the sign-in notice.
- **The app id is only as current as the platform** — the About page cannot show a registered app id before the platform answers, and the local deploy anchor stays a deployment fact rather than a substitute.
- **No update action in the About dialog** — checking for updates stays the settings menu's and the desktop updater's own surface; the dialog deliberately does not duplicate that flow.
- **Product links fall back to the shipped identity** — before the platform answers, or when it cannot be reached, the links card shows the shipped BirdCoder destinations rather than hiding the row.
