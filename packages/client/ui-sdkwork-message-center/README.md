---
description: "SDKWork message center: the mode rail's mail shortcut above Settings and the message page it selects as the center column over the SDKWork app notification API."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-message-center

English | [中文](README.zh.md)

## Summary

Provide the account message center as two seats of the existing frame: a mail shortcut in the mode rail directly above Settings, and the message page it selects as the center column instead of the current conversation. The rail badge counts unread notifications; the page groups them by local calendar day, opens one in place, and marks an unread notification consumed when the user opens it. Selecting the shortcut is a plain panel selection, never a modal.

## Table of Contents

- [Use this package](#use-this-package)
- [Notification contract](#notification-contract)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The Web bundle mounts this plugin as `ui-sdkwork-message-center`. It contributes exactly two seats:

- **The rail shortcut** (`mode.rail.panel`, id `message-center`, order `20`). The panel seat renders ascending, so `20` sits below the IM connector row (`10`) and directly above the Settings seat. The cell is a 44px icon: the unread mail glyph plus a dot while notifications are unread, the read glyph otherwise. Clicking it re-reads the first page and selects `message-center` as the center column's main panel; the cell paints the selected state while the message page owns the column. It renders for every composition; a missing origin or session is the page's own state, never a dead icon.
- **The message page** (`main`, key `message-center`). The frame renders this keyed entry in place of the conversation while the panel is selected. The header carries the centered title, the unread summary line, the detail view's back control, the refresh action, and the close button (which selects the conversation again); the body holds the state block, the day groups, and the in-place detail view.

The shortcut and the page read one snapshot source, so the badge and the rendered unread state cannot disagree. The plugin owns polling, the unread badge, acknowledgement, and presentation; the notification service owns visibility, ordering, and consumption. The left column stays in place while the page is open, and selecting a session returns the center column to that conversation.

Startup and every credential or environment write start a new read cycle with an immediate `list` request. Credential writes come from `ctx.iam.sessionTokens()` and `ctx.iam.onAuthToken()`; the static `accessToken` of the active environment profile fills the access-token header when the session carries none, so a deployment with a bootstrap token still reads. Selecting the shortcut re-reads the first page; the badge poll reads at `pollIntervalMs` until the plugin is disposed. The page is the first `pageSize` notifications; `hasMore` renders the load-more row. Nothing is stored in the browser beyond the mounted snapshot.

Every failure is classified for the presentation: a refused credential (`401`, or `403` without the CORS problem code) clears the badge and shows the signed-in-empty state with the in-app sign-in gesture (`requestSignInInPlace`), a network or gateway failure with no cached page shows the retry state, and a later failure keeps the cached page behind a retry banner. Acknowledgement is optimistic: the notification is marked read before the write, a refused write reports the banner and reconciles on the next read, and a refused credential returns to the signed-out state.

<a id="notification-contract"></a>
## Notification contract

The plugin speaks the app notification API served under the active environment's app-api gateway:

| Operation | Request |
|---|---|
| List | `GET /app/v3/api/notification/notifications?page=<n>&page_size=<n>` |
| Acknowledge | `POST /app/v3/api/notification/notifications/<id>/acknowledge` |

Requests carry the SDKWork dual-token credential headers (`Access-Token` and `Authorization: Bearer`), both optional and both derived from the session. They deliberately send no `app_id`: the platform derives the application context from the credential and rejects a client-supplied context selector. Responses use the shared `{ code, data, traceId }` envelope; `data` is `{ items, pageInfo }`.

Each item carries `id`, `appId`, `title`, `desc`, `content`, `time`, `type` (`info`/`billing`/`warning`/`alert`), `read`, `showAsPopup`, `popupSeen`, `archived`, and an optional `actionUrl`. Content falls back to the summary. An unusable item is skipped with a diagnostic so its valid neighbours still render; `pageInfo.hasMore`, or `page < totalPages`, reports the continuation. The page orders the notifications newest-first by the parsed publish time, keeps undated notifications last, and prefixes an undated notification's group with the date its text starts with. `actionUrl` becomes a link only when it is an absolute HTTP(S) URL or a site-relative path.

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---|---|
| `pollIntervalMs` | `60000` | Badge polling interval in milliseconds. |
| `pageSize` | `20` | Notifications requested per page; the API accepts 1–200. |

Both fields are volatile, so a `cordis.yml` change reaches open pages from the next poll without remounting the plugin. The API origin and static access token come from the shared [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile; the credential triple comes from `ctx.iam`.

<a id="model-experience"></a>
## Model Experience

None, as the plugin is browser-side product chrome over the SDKWork notification API; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; the plugin neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The unread badge counts the loaded page only** — the API exposes no unread count, so notifications beyond the first `pageSize` do not raise the badge until the user loads them. A server-side count operation would remove the approximation.
- **No automatic popup** — `showAsPopup` and `popupSeen` reach the client but the center never raises a dialog on its own, and it never calls the `popup_seen` operation. The account notification cards in [ui-account-notifications](../ui-account-notifications/README.md) remain the separate DeepSeek account channel; deliberately interrupting a workspace is a product decision this center does not take.
- **Read is the only mutation** — archive, mark-all-read, and delete have no operation here; the receiving user cannot dismiss a notification from the list.
- **The gateway must allow the page origin** — a deployment whose CORS policy does not carry the page origin answers `403` before any read; the center then reports the unavailable state.
