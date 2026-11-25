# Agent Note: SDKWork message center in the mode rail

Status: implemented

English | [中文](2026-11-26-sdkwork-message-center.zh.md)

## Problem

BirdCoder2 had no in-product inbox for SDKWork account notifications. The existing account notification surfaces (`ui-account-notifications`) show DeepSeek account notices as floating cards beside the account menu; that is a different backend channel, it offers no history or detail view, and it never surfaces a product notification such as an upgrade reward. CloudRouter ships the reference implementation: a notification bell backed by the app notification API (`/app/v3/api/notification/notifications` — list, acknowledge, popup-seen) that the signed-in credential already reaches. Users asked for the same surface above the rail's Settings icon.

## Decision

The fork adds `@deepseek-ai/dsh-client-ui-sdkwork-message-center` (`packages/client/ui-sdkwork-message-center`) as a browser-only plugin that contributes two seats:

- `mode.rail.panel`, id `message-center`, order `20`. The panel seat renders ascending, so this cell sits directly above Settings (below the IM connector row at `10`). It paints a mail glyph and an unread dot from the shared snapshot.
- `shell.overlay`, id `message-center`. It renders the overlay only while the shared UI store handle says open, and shows the state block, day-grouped list, and in-place detail view.

The shortcut and the overlay are registered with one `createMessageCenterUiStore()` handle, so the click's open action and the overlay's rendered state cannot disagree. The plugin's `MessageCenterService` owns the snapshot (status, items, unread count, continuation, failure), polling, and the optimistic acknowledge; the notification service owns visibility, ordering, and consumption.

The transport is the shared `@sdkwork/sdk-common` HTTP client: it injects the dual-token headers (`Access-Token`, `Authorization: Bearer`) from the IAM session's token triple, falls back to the environment's static access token, unwraps the `{ code, data, traceId }` envelope, and throws typed failures. Requests deliberately omit `app_id`: the platform derives the application context from the credential and rejects a client-supplied context selector with `400`. The page items are validated at the wire boundary; an unusable row is skipped with a diagnostic so its valid neighbours still render. `pageInfo.hasMore`, or `page < totalPages`, drives the load-more row. Failures classify into `unauthorized` (clears the badge and offers the in-app sign-in gesture), `unavailable` (retry state), and `unknown`; a later failure keeps the cached page behind a retry banner.

`pollIntervalMs` (default `60000`) and `pageSize` (default `20`, API range 1–200) are volatile Config fields, so a `cordis.yml` change reaches open pages on the next read without remounting the plugin.

## Alternatives considered

- **Reuse the `ui-account-notifications` cards.** They read the DeepSeek account channel, never the SDKWork app notification service, and they cannot present a history or a full body. Reusing them would not satisfy the notification source this product needed.
- **Open the center as an app mode.** A mode page replaces the workspace and adds a rail mode entry; the requested surface is a focused list raised from its icon. The overlay keeps the workspace and the rail's mode vocabulary untouched.
- **Proxy reads through a Host service.** Every SDKWork feature in this fork already calls the app-api gateway from the browser with the session credential, and the desktop shell is a registered first-party CORS origin. A Host hop would add a wire contract and duplicate credential handling without changing reachability.
- **Raise an automatic popup for `showAsPopup` notifications.** Interrupting a running task is a product decision, not a transport gap; the field is carried but unused and the limitation is documented.
- **Hand-write `fetch`.** The shared SDKWork client already implements dual-token headers, envelope unwrapping, and typed errors; a second implementation would be one more contract to keep in step.

## Consequences

- The rail gains one 44px cell directly above Settings; panel ordering remains explicit (order `20` below the IM connector's `10`).
- The unread badge counts the loaded page only, because the API exposes no count operation; this is recorded as a limitation rather than approximated from a second endpoint.
- The overlay's day groups are newest-first with undated notifications last; opening a notification marks it read through the acknowledge operation, and the write is optimistic.
- A deployment must allow the page origin in the gateway's CORS policy; an unregistered origin answers `403` before any read, which the center reports as unavailable.
- Verification: the package tests cover the wire contract, the transport against a stubbed `fetch`, the service lifecycle, both components, and the apply wiring over the real transport (`packages/client/ui-sdkwork-message-center/tests/`).
