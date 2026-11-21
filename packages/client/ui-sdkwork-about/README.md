---
description: "SDKWork 关于 (About) plugin: the settings section and desktop dialog presenting the product mark, build version, the installation's registered app id, and the application identity the BirdCoder2 App API resolves from the deployment access token."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-about

English | [中文](README.zh.md)

## Summary

SDKWork 关于 (About) plugin: one settings section (id `about`, order `1000`, after every feature page) and one `shell.overlay` dialog that render the same product page — the BirdCoder mark, the client build version, the installation's registered app id, the deployment identity the platform verified, and the product links. The desktop application menu's About command opens the dialog through the `ctx.about` service, so the native menu and the settings page reach one About design. The installation read is `GET /app/v3/api/installation` through the generated `@sdkwork/birdcoder2-app-sdk` client, authenticated with the ui-sdkwork-env profile's public application access token.

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
- **The page body**: a hero (mark, product name, version chip, tagline, platform-read status, refresh action), an application card (version, registered app id, product key, vendor), a deployment card (environment, deployment mode, release scope, tenant, organization when organization-scoped, API endpoint, commit), a links card (website, support, privacy, terms), and the copyright line. Copy buttons sit beside the version, app id, API endpoint, and commit.
- **The dialog**: the same content in compact framing, portaled to the document body, dismissable by the close button, mask click, Escape, or the confirm action.

## Data

Local facts come from the client build (`DSH_CLIENT_VERSION`, `DSH_CLIENT_COMMIT_HASH`, `DSH_CLIENT_GIT_DIRTY`) and the ui-sdkwork-env profile (declared app id, product key, gateway origin, environment, access token). The platform read returns the installation's deploy application id, tenant, organization scope, release scope, lifecycle environment, deployment mode, and the product slice frozen at install time; `decodeInstallationApplication` re-validates that wire response before any component reads it.

The runtime owns both snapshots as stable observables. A refresh keeps settled facts on screen while it runs; a failed or incomplete read renders the localized notice with the technical detail behind a disclosure, and the local facts stay visible.

## Installation identity

The access token names the installation: the platform verifies the credential and resolves `WebRequestContext`, and the route projects that verified identity rather than trusting a client-supplied app id. This is why the About page shows the registered app id from the response and never from the settings document. A deployment that carries no token (an IAM-session-only launch) renders the "no access token" notice instead of guessing.

## Desktop About command

`apps/desktop/src/about-command.ts` owns the `sdkwork:about:open` / `sdkwork:about:takePending` channels; `iam-preload.ts` exposes them under `window.sdkworkDesktop.about`. The application menu entry runs `aboutCommand.show()`, which focuses the workspace window and announces the command; a click that arrives before the page listens stays pending and is consumed once when this plugin mounts.

## Implementation notes

- The plugin is gated on the `env` Cordis service (`inject`), so a composition without `ui-sdkwork-env` leaves it pending rather than reading an unconfigured endpoint.
- The SDK client is constructed in the apply closure, never in a component; the response is narrowed at the wire boundary and the components receive plain data through the injected face.
- The dialog's visibility lives in a declared store created once in `apply`, so the service and the rendered dialog cannot disagree.

## Model Experience

None, as the About surfaces are browser-side product identity UI; they neither assemble nor send model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Static public token only** — the read uses the deployment profile's static access token; an IAM-session-only launch has no token to read with and shows the unconfigured notice. Reading the installation through a user session would need an authenticated app-api face the route does not publish today.
- **No update action in the About dialog** — checking for updates stays the settings menu's and the desktop updater's own surface; the dialog deliberately does not duplicate that flow.
- **Product links fall back to the shipped identity** — before the platform answers, or when it cannot be reached, the links card shows the shipped BirdCoder destinations rather than hiding the row.
