# Agent Note: SDKWork IM surfaces embedded from a prebuilt bundle

Status: implemented

English | [中文](2026-10-20-im-surfaces-from-prebuilt-bundle.zh.md)

## Problem

BirdCoder should offer the SDKWork IM product surfaces — the conversation list,
one open conversation, and the contacts directory — as first-class modes in the
leftmost rail, directly below Code, without re-implementing any IM UI. The IM
product UI already exists in the sibling `sdkwork-im` repository, but its PC
packages are deeply coupled to the rest of that ecosystem: the chat package's
declared closure spans the RTC, Notary, and Agents trees, and its modules import
roughly fifty sibling packages.

Compiling those sources from BirdCoder — through `tsconfig.base.json` path
aliases plus a pinned sibling checkout — pulls that whole closure into the
BirdCoder dependency gate. The gate reports every closure package that the
mapping does not cover, the Dockerfiles grow a second source tree, and the final
browser bundles would carry IM's internal module graph. The result couples two
products' release trains for a UI that only needs three surfaces.

Reading the same repository as a package dependency is also not enough: the IM
PC packages are application-internal (their `package.json` entries point at
sources, their styles are Tailwind sheets keyed to the IM document, and their
session/auth gate assumes the standalone application).

## Decision

**The IM product owns its build; BirdCoder hosts a contract.**

- `sdkwork-im` gains an embed build (`apps/sdkwork-im-pc/src/embed/main.tsx`,
  `vite.embed.config.ts`, `pnpm --dir apps/sdkwork-im-pc run build:embed`). It
  emits one self-contained IIFE, `dist-embed/im-pc-embed.js`, which publishes
  `SdkworkImEmbed.mountSurface(container, options)` and
  `unmount()`/`update(options)` handles. Surfaces are `conversation-list`,
  `conversation`, and `contacts`; the bundle mounts each into a shadow root with
  its own stylesheet so the IM Tailwind sheet cannot leak into the host page.
- The host passes only host facts and callbacks: `apiBaseUrl`, the dual-token
  session, `locale`, `colorScheme`, the selected conversation id, and
  `onConversationSelect` / `onConversationOpen` / `onUnreadChange` /
  `onError`. The bundle keeps owning transport, realtime, message loading,
  directory loading, and translation.
- The bundle validates those facts and initializes the IM SDK client once at
  runtime setup (typed `ImPcEmbedInitError` codes), keeping the WebSocket lazy
  until a surface subscribes. Short mode switches reuse the client and socket
  through a bounded idle grace; disposing the runtime closes the connection and
  resets the client. Validation failures no longer blank the interface: the
  runtime records the failure, the surfaces still mount behind a product-shaped
  fallback, and the host announces it as a transient toast (a failed bundle
  load keeps its own `load-failed` report).
- The host/bundle boundary is versioned: the bundle publishes
  `SdkworkImEmbed.version` (currently `1`) next to `mountSurface`, and the
  adapter refuses a bundle that declares another contract version instead of
  calling an incompatible API, while a bundle predating the field is treated as
  version 1. The adapter also validates the deployment URL:
  absolute HTTP(S)/application origins and root-relative same-origin paths are
  accepted, while other schemes and URLs carrying credentials are rejected
  because the script executes with the host page's privileges.
- BirdCoder adds four sdkwork client plugins, none importing IM code:
  - `ui-sdkwork-im` loads the bundle once per page from the active environment
    profile's `imEmbedUrl` (projected from `SDKWORK_IM_EMBED_URL`), provides
    `ctx.im`, and tracks the unread total and selected conversation.
  - `ui-sdkwork-im-conversations` owns the `chat` mode: its rail entry (with the
    unread badge) and the two-column page that mounts the conversation list and
    declares the `im.chat.pane` seat.
  - `ui-sdkwork-im-chat` fills that seat with the conversation surface.
  - `ui-sdkwork-im-contacts` owns the `contacts` mode and its page.
- `AppModeId` gains `chat` and `contacts`; the rail order places both directly
  after `code`. Their window titles and copy live in the existing locale
  dictionaries.
- A script tag, not a dynamic `import()`, loads the bundle: client-module
  bundles are closure factories with no importing context of their own, and an
  IIFE global works where an ES-module import cannot.

## Alternatives considered

**Compile sdkwork-im's PC packages as sibling sources.** Rejected: it surfaces
the whole IM ecosystem in the dependency gate, grows the Docker build context,
and makes every BirdCoder build depend on IM's internal module graph and
TypeScript settings — high coupling for three surfaces.

**Join the full SDKWork ecosystem workspace.** Rejected for the same coupling
reason, plus CI cost: every IM release would need to satisfy BirdCoder's gates,
and every BirdCoder refactor would need to keep IM's sources compiling.

**Mount the IM PC application in an iframe.** Technically the smallest host, but
it loses what the integration is for: one frame-level navigation (selecting a
conversation, opening chat from a contact), shared theme and language, and a
single sign-in session. The standalone app's own routing and auth gate would
fight the host, and each surface would ship the whole application anyway.

**Re-implement the three surfaces in BirdCoder.** Rejected: duplicates the IM
product's message, directory, realtime, and translation behavior, and diverges
from the product's own UI — the opposite of high cohesion.

**Publish the IM PC packages to the registry and depend on them.** Deferred, not
rejected: they are currently application-internal, so publishing them is a
larger change than this integration. A stable embedded-bundle contract is the
precondition either way.

## Consequences

- BirdCoder's manifests, tsconfig paths, and dependency gate know nothing about
  IM. The coupling is one runtime contract: `mountSurface` plus the option
  object, versioned by the bundle artifact the deployment serves.
- The environment profile carries an `imApiBaseUrl` alongside `apiBaseUrl`, defaulting to the tier domain (`http://api-dev.birdcoder.com`, `https://api-test.birdcoder.com`, `https://api.birdcoder.com`) and projected from `SDKWORK_IM_API_BASE_URL`; IM reads it before `apiBaseUrl`, so each environment talks to its own IM gateway and derives its realtime origin from it.
- The deployment must publish `im-pc-embed.js` on a URL and set
  `SDKWORK_IM_EMBED_URL` (or the settings document's `imEmbedUrl`). With the
  field empty, the chat and contacts pages state that IM is not configured
  instead of mounting a broken surface.
- The bundle is a single ≈3.3 MB raw (≈850 KB gzip) payload carrying the chat
  surface and its dependencies. A later split can trim it once the surfaces stop
  importing the application shell.
- IM modals that portal to the host `document.body` escape the shadow root and
  render unstyled. Surfaces that open such modals stay inside the IM surface
  tree until the bundle accepts a portal target.
- One IM runtime per page: the bundle owns process-global IM state, so a page
  hosts exactly one embedded IM session. Reconfiguring replaces the session.
- The IM gateway must accept the host page origin for the REST and realtime
  transports (the bundle sends `Authorization` and `Access-Token` headers), and
  the deployment must serve the bundle with a JavaScript content type.
- The unread badge updates only while a list or contacts surface is mounted;
  otherwise it keeps its last value.

## Verification

- `sdkwork-im`: `pnpm --dir apps/sdkwork-im-pc run lint`, the SDK `typecheck`,
  `test:chat-auth-realtime-guard`, and `build:embed` (emits
  `dist-embed/im-pc-embed.js`, ≈3.7 MB raw / ≈1.0 MB gzip, and the entry
  exposes `SdkworkImEmbed.mountSurface`).
- BirdCoder: `pnpm exec tsc -b tsconfig.client.tests.json`,
  `pnpm run verify-sdkwork-dependencies`,
  `pnpm run verify-package-dependencies`, and the four packages' own suites
  (`pnpm exec vitest run packages/client/ui-sdkwork-im*/tests`), which include
  the loader's script, failure, unconfigured, and unsigned-session arms plus the
  pages' mount/update/dispose behavior, at the per-file coverage gate.
- The four client bundles build from BirdCoder sources alone
  (`pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-im run bundle`, …), and
  their `lib/client.js` sizes (7–35 KB) show no IM code was compiled in.
- `pnpm exec playwright test` (sdkwork-im, Chromium) passes 13 cases with the
  live-stack case skipped: the authenticated shell, inbox hydration and outbound
  send, the 10k-conversation virtualization, and `e2e/embed-surfaces.spec.ts`,
  which injects the built bundle into a route-fulfilled harness page and mounts
  the conversation list in a shadow root, a conversation that renders the
  timeline, posts an outbound message, and appends an inbound message pushed
  over a mocked CCP WebSocket handshake (auth → hello → auth bind →
  subscriptions), the contacts directory, a conversation list whose gateway is
  unreachable (the IM product shell still renders), and an unusable gateway
  origin whose failure the host receives while the shell stays mounted.
- `pnpm run test:im-embed-host` (sdkwork-im) proves the host-installed gateway
  origin, realtime origin derivation, dual-token session precedence, embedded
  persist routing, signed-out state, and detach behavior.
- The assembled client graph (`apps/web/tests/app-modes.e2e.ts`) renders the
  rail as Code → Chat → Contacts, dispatches both IM mode pages, and replaces
  their surfaces with the IAM signed-out notice in an anonymous composition.
- A jsdom smoke of the built artifact (`SdkworkImEmbed.mountSurface`) mounts
  `conversation-list`, `conversation`, and `contacts` into shadow roots with the
  inlined stylesheet and dark scope, updates and unmounts each with no console
  error. The build bakes React's production define, so the artifact has no
  `process.env.NODE_ENV` reference and reports 0 such references.
