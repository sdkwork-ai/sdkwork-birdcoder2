---
description: "SDKWork IM host adapter: loads the deployment's IM embed bundle, hands it the gateway origin, IAM session, and frame language, and provides ctx.im (surface mounts, unread total, conversation selection and navigation)"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im

English | [中文](README.zh.md)

## Summary

The IM host adapter owns the boundary between BirdCoder and the SDKWork IM
product UI. The IM UI is built and deployed by sdkwork-im (`pnpm --dir
apps/sdkwork-im-pc run build:embed` emits `dist-embed/im-pc-embed.js`), so this
plugin compiles no IM sources and declares no IM dependencies: it injects the
bundle script once, then mounts the requested surface into a host-owned
container with the active gateway origin, IAM session, and frame language.

`ctx.im` is the only surface the chat and contacts plugins see:

- `mountSurface(container, request)` — mounts `conversation-list`,
  `conversation`, or `contacts`; returns `update`/`dispose`.
- `selectConversation(id)` / `openConversation(id)` — the chat page's selection
  and the contacts page's "send message" navigation.
- `getSnapshot()` / `subscribe()` — selected conversation and the inbox unread
  total the rail entry badges.

## Runtime requirements

The adapter requires `ctx.env`, `ctx.iam`, `ctx.layout`, and `ctx.locale`. The
active environment profile's `imEmbedUrl` names the deployed bundle; when it is
empty the pages state that IM is not configured for the deployment. The bundle
receives the profile's `imApiBaseUrl` (falling back to `apiBaseUrl`) as its
gateway origin, so each tier talks to its own IM domain
(`http://api-dev.birdcoder.com`, `https://api-test.birdcoder.com`,
`https://api.birdcoder.com`) and the realtime origin is derived from it. The
embed script is loaded through a `<script>` tag rather than a dynamic import
because client-module bundles are closure factories with no importing context of
their own.

`imEmbedUrl` accepts an absolute HTTP(S)/application URL or a root-relative path
served by the deployment origin; any other scheme and a URL carrying credentials
are rejected, because the script runs with the host page's privileges. The bundle
API is versioned: it publishes `version` (currently `1`) with `mountSurface`, and
the adapter refuses a bundle that declares another contract version instead of
mounting surfaces against an incompatible API (a bundle predating the field is
treated as version 1). Bump the version on both sides when the mount options or
handle semantics change.

## Initialization and failure reporting

`mountSurface` reports one of these codes, which the pages translate into a
transient toast; the product shell stays on screen in every case:

- `unconfigured` — the profile has no `imEmbedUrl` or no gateway origin; the
  service logs which launch key is missing. Without an embed URL there is no
  surface to mount, so the page keeps its product-shaped placeholder; without a
  gateway the surface still mounts and the SDK failure is announced.
- `mount-failed` — the IAM session has no dual tokens to authenticate with;
  the surface mounts signed out and the toast explains why.
- `load-failed` — the bundle script could not load or did not publish
  `SdkworkImEmbed`; the page keeps its placeholder shell.
- `init-failed` — the bundle loaded but the IM runtime reported a degraded
  initialization (bad gateway origin, malformed session, SDK construction
  error). The bundle still mounts its surfaces, the host announces the code as a
  toast, and the console names the gateway and bundle.

The bundle initializes the IM SDK client once per host-fact change (gateway
origin or rotated tokens) without opening the realtime socket. The WebSocket
connects when a mounted surface subscribes, survives short mode switches, and is
closed when the runtime is disposed.

## Model Experience

None, as the plugin renders a human-facing messaging surface and does not add
prompt content, tools, or session events.

#### KV Cache effect

None; IM traffic is separate browser traffic and does not alter Harness provider
requests.

## Known Limitations and Deferred Work

- **One IM runtime per page** — the embed bundle owns process-global IM state,
  so one page hosts one IM runtime. Reconfiguring replaces the previous session.
- **Single script payload** — the bundle is not code-split (≈3.3 MB raw, ≈850 KB
  gzip) and carries the whole chat surface.
- **Portals escape the shadow root** — IM modals that portal to
  `document.body` render unstyled outside the bundled stylesheet.
- **Unread badge needs a mounted list** — the embed reports unread totals only
  while a list or contacts surface is mounted; the rail badge stays at its last
  value otherwise.
