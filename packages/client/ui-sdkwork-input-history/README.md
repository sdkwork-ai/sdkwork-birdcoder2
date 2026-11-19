---
description: "SDKWork input history plugin: records Host-accepted composer messages in the browser and recalls them from the chat input with ↑/↓ across the session, the project, or every session, configured on its own settings page."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-input-history

English | [中文](README.zh.md)

## Summary

The composer keeps no history: a sent message leaves the editor. This plugin records each Host-accepted ordinary message in browser-local storage and lets the composer's bare ↑/↓ recall it: ↑ walks older entries, ↓ walks toward the newest and past it restores the interrupted draft, and a fresh walk starts only at the draft's asking edge. Its Input history settings page chooses the scope — this Session (default), this project, or every Session in this browser — the retention window (default 30 days), and clears the cache.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

The plugin mounts as the web-app `ui-sdkwork-input-history` row. Once active it records messages as they are accepted and offers the settings page under Settings → Input history. Turning the feature off stops both recording and recall; the stored ledger stays until cleared or expired.

History is per browser profile, not per account or machine: it does not sync, and clearing site data clears it.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/client/index.ts` — registers the dictionaries and the `settings.section` page, then wires the two seams: `ctx.shortcuts.observeFixedInput` for the gesture and `ctx.on('conversation/input-accepted')` for recording. Its `inject` is the only service surface it touches.
- `src/client/input-history-store.ts` — the durable ledger: localStorage document (`dsh.inputHistory.v1`), schema/entry normalization, de-duplication of a repeated message in one Session, the 500-entry ceiling, scope-addressed reads, and retention pruning on every read/write path plus an hourly sweep.
- `src/client/input-history-controller.ts` — the gesture: it resolves the composer's Session from the card's `data-composer-session-id`, refuses keys the composer already consumed (`defaultPrevented`), composing keys, modifiers, and caret positions away from the asking edge, then applies the chosen entry through the Session input facade (`setDraft`). While a recalled entry shows, an arrow continues the walk only from a document edge; inside the entry it still moves the caret.
- `src/client/composer-target.ts` — the DOM contract: the composer contenteditable (`data-composer-input`), its Session card, and the caret-boundary test.
- `src/client/InputHistorySection.tsx` — the settings page: immediate switch/scope writes, a staged retention field, cached-entry count, and clear.

The conversation package owns the two facts this plugin consumes: the `conversation/input-accepted` event (emitted after Host acceptance, never for command submissions) and the composer card's Session attribute.

### Scope and retention

Scope is resolved at read time from one ledger. Each entry carries the Session that sent it and the project key that Session's working directory produces; the settings select which slice ↑/↓ walks. Switching scope is therefore instant and lossless. An entry stops being recallable the moment its age exceeds the retention window, whether or not the hourly sweep has run.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. It is a browser-only plugin: the node half is an empty `apply`.

## Runtime invariants

The spec suite verifies that disposing the plugin fiber removes the settings section, the fixed-input observer, and the accepted-input listener (HMR safety).

## Model Experience

None, as this package is browser-side composer presentation state; the ledger never enters a prompt, a tool result, or the session log, and recording happens only after the Host accepted the message.

#### KV Cache effect

None; no provider request is assembled or mutated.

## Known Limitations and Deferred Work

- History is local to one browser profile; there is no Host-side store, sync, or cross-device recall.
- Recording starts when the plugin is active: messages sent before it was enabled, or before the ledger existed, are not backfilled from the Session transcript.
- Only ordinary accepted messages are recorded. Command submissions (`/…`), queued-then-edited messages, and content that failed to send are not recall candidates.
- Recall replaces the complete draft. Inline reference chips and attachments in the interrupted draft are restored only as their clipboard text (attachments stay in the composer because replacing text does not clear them).
- The walk trusts the composer's caret at gesture time; a custom editor surface that does not render `data-composer-input` / `data-composer-session-id` gets no recall.
