# Agent Note: Composer input history

Status: implemented

English | [中文](2026-11-19-composer-input-history.zh.md)

## Problem

The composer discards a message's text as soon as the Host accepts it, so recalling a previously sent phrasing means finding it in the transcript again. The fork wanted shell-style ↑/↓ recall in the chat input — per Session by default, with project and global options and a configurable retention — without sending the ledger to the Host or the model.

## Decision

- A fork-owned client plugin, `packages/client/ui-sdkwork-input-history`, owns the whole feature: the browser-local ledger, the gesture controller, and one `settings.section` page for scope, retention, and clearing.
- The conversation package publishes one typed event, `conversation/input-accepted`, after an ordinary message settles as accepted, and marks its composer card with `data-composer-session-id`. Both are UI-only extension points; command submissions never fire the event.
- The gesture rides `ctx.shortcuts.observeFixedInput` after every local composer handler, so a key the `/` or `@` menu consumed never reaches history. A fresh walk starts only with an empty draft or the caret at the asking edge; once an entry shows, only a press from a document edge continues the walk, while presses inside it move the caret. ↓ past the newest entry restores the draft that recall interrupted.
- Entries carry the sending Session and the project key produced by that Session's working directory. Scope is resolved at read time, so switching scope is lossless. Retention (default 30 days, 1–365) is enforced on every read and write, at boot, and by an hourly sweep. Storage is `localStorage` (`dsh.inputHistory.v1`), capped at 500 entries and 500,000 characters of text so the whole document stays well inside browser quota.

## Alternatives considered

**Reconstruct history from Session events.** Every Session already stores its user messages, but only a retained Session has an event window, nothing would supply the project or global slice, and the client would have to parse conversation records owned by `ui-conversation`'s assembler. Capture at acceptance is bounded, private, and scope-consistent.

**Register ArrowUp/ArrowDown as shortcut commands.** The shortcuts registry validates defaults, treats bare arrows as reserved input, and its dispatch cannot express "only when no local handler consumed this key". Fixed-input observation runs after the composer's own handlers and exposes the live DOM target plus `defaultPrevented`.

**Store the ledger on the Host.** The ledger is presentation state with no model-visible effect; Host storage would add wire surface and cross-device semantics the requirement did not ask for. Browser-local storage matches the existing composer-draft and rail-layout precedents.

## Consequences

- The feature is per browser profile: no sync, no cross-device recall, and clearing site data clears it. Open tabs do not synchronize the ledger; the last writer wins. The ledger is not partitioned by signed-in account and sign-out does not clear it, so a shared profile must clear it manually before switching accounts.
- Recording starts when the plugin is active; messages sent earlier are not backfilled from the transcript.
- The event must stay after Host acceptance and must never carry command submissions; observation failures are contained so settlement cannot be interrupted.
- The `ui-conversation` seam is a fork divergence maintained across upstream merges: the event declaration, the hub emission, and the composer attribute must move together.

## Testing

`tests/` covers the ledger (defaults, scope reads, de-duplication, the 500-entry ceiling, retention at read/boot/sweep, persistence and corrupt storage), the gesture (caret edges, menu/modifier/IME guards, scope walks, draft restoration, disabled state), real key routing over a Lexical composer, the settings page render, and the plugin's registration and teardown over the real slot registry and event bus.
