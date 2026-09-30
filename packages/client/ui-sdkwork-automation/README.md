---
description: "SDKWork Automation as an independent module: the Automation quick entry in the sidebar's New Session button area and its center-column page with the scheduled-tasks and run-history views."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-automation

English | [中文](README.zh.md)

## Summary

Automation as an independent module: its quick entry in the sidebar's New Session button area and its page, keyed by the `automation` mode id. The page lists every retained Host Schedule task behind a status filter and a search field; each row states its name, frequency, and next run and opens a detail panel that edits the name, instruction, and run time, confirms deletion, and shows saved delivery records beside the linked conversation. The template catalog below the list stages a card's recurrence in the same add-task dialog, which picks the conversation's workspace and submits the composed `schedule_create` request.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime invariants

No runtime invariant companion is published; the entry is a pure function of the seat's owner share, and the keyed page renders the Host catalog this package reads, covered directly by this package's client behavior specs.

## Model Experience

None, as this browser UI registers no prompt, tool schema, or Session event of its own; the create dialog's confirm sends one ordinary user message, the same input a person types into the composer.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Creation runs through a conversation** — the Host exposes no Remote method that creates a task, so the dialog's confirm sends a composed request into a new Session and the task exists once the model calls `schedule_create`; a refused or lost prompt leaves the request in the conversation rather than creating anything.
- **Scheduled tasks are opt-in** — the shipped Web composition carries no `schedule` row, so without the optional bundle the page states that the capability is not enabled instead of listing tasks.
- **Run history reads a bounded window** — the view reads one saved-delivery page for each of the newest twenty tasks and says so in a notice; older tasks are not read.
- **Deletion reports only in place** — a confirmed deletion clears its row and closes the detail once an authoritative read confirms the removal, and a failure leaves the row to retry; there is no app-wide notice surface yet.
- **A rule edit is a compare-and-update** — the panel submits the record it read, so a task that moved meanwhile comes back as a conflict and the draft stays until the author cancels and reopens it.
- **Static template catalog** — the twelve cards carry copy plus a recurrence in this package; a card stages them in the same dialog rather than creating anything itself, and no card reads the workspace or the existing tasks.
- **Full workspace access is not a Schedule option** — the dialog states that control as under construction (`aria-disabled` with the reason) instead of collecting a choice the create request cannot carry.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The mode id joins the frame's `AppModeId` vocabulary in ui-layout, and the shared app header resolves the mode title from its own table — keep the id and the locale namespace (`automation`) identical across the entry, the page, and that table or they drift apart. The sidebar column stays mounted for this mode by the frame's sidebar-visible mode set (ui-layout's `AppFrame`), not by this package. The catalog source is this package's own: it reads `schedule/catalog`, `schedule/delete`, and `schedule/history` through the client Remote assembly and reports a missing Host capability as its own state. `schedule-format.ts` and `task-cron.ts` are ports of the upstream Schedule UI's pure formatters, so a stored rule reads the same way in both surfaces.

</details>
