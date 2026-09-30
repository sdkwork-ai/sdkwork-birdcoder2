# Agent Note: The SDKWork Automation task surface

Status: implemented

English | [中文](2026-09-30-sdkwork-automation-task-surface.zh.md)

## Problem

`packages/client/ui-sdkwork-automation` renders the fork's `automation` mode page, and the Host Schedule capability behind it is opt-in: the shipped Web composition mounts no `schedule` row, so a default installation exposes no task read and no `schedule_*` tool, while the page is the fork's product surface for the Host's stored tasks ([the schedule opt-in decision](2026-09-24-schedule-opt-in-optional-bundle.md)). Upstream's Schedule UI carries a task page for the same records, but it ships inside the optional bundle's `ui-schedule` row, and the Host exposes task creation only as the model-facing `schedule_create` tool, so no Remote write exists for a browser page to call.

## Decision

The Automation page is the fork's own scheduled-task surface. `packages/client/ui-sdkwork-automation` reads the Host Schedule capability through the client Remote assembly: `src/client/index.ts` injects `remote.schedule` and hands `schedule/catalog`, `schedule/delete`, and `schedule/history` to the package's own catalog source (`src/client/catalog-source.ts`), which owns the records, the query state, deletion, and retry. The page is not a mounting of upstream's `ui-schedule` page: the fork owns the page (`src/client/AutomationPage.tsx`), the copy (`src/client/locales.ts`, namespace `automation`), and the data layer, while the mode id, the sidebar entry, and the frame's sidebar-visible set stay as [the sidebar-actions decision](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.md) records.

`src/client/schedule-format.ts` and `src/client/task-cron.ts` are byte-identical ports of the upstream files with the same names under `packages/client/ui-schedule/src/client/`, so a stored rule reads the same in both surfaces. That duplication is deliberate, and every upstream merge re-checks the two pairs.

Task creation has no Remote method behind it: the Host's Schedule service exports Remote methods for `list`, `catalog`, `history`, `delete`, and `update`, and none for creation. The add-task dialog therefore composes a request naming the exact `schedule_create` arguments (`src/client/create-request.ts`), and the plugin dispatches it into a fresh conversation (`src/client/index.ts`): the shared New Session flow, a bounded wait for the landed Session, then one queued user message. This is why the fork's dialog exists where upstream's page carries a New action that starts a session.

A read that reports `gateway/invocation-unavailable` becomes the catalog's own `'unavailable'` state (`src/client/catalog-source.ts`) rather than an ordinary query failure: the page states that the shipped composition mounts no scheduled-task capability and names the Plugins page as the switch, and the state's retry re-reads the catalog after the optional bundle is enabled.

## Alternatives considered

**Porting upstream's `ui-schedule` page wholesale.** The fork's mode page would then carry upstream's `schedule.manager` copy and its keyboard-free layout, and every upstream change to that page would need a hand re-merge; the fork instead keeps upstream's own components for the parts whose behaviour must not drift — the rule formatters, the date and clock pickers, the actions menu, the delivery history — and owns the page, the list, and the create dialog itself.

**Adding a Remote method for creation.** Creation is the service method behind the model-facing `schedule_create` tool, and the tool owns the argument vocabulary the model reads; a Remote `create` would add a browser write path this dialog alone calls, kept in step with the tool that already performs the operation.

**Treating a missing capability as an ordinary query failure.** The shipped composition mounts no `schedule` row, so a read there reports `gateway/invocation-unavailable`; the failure state would report a broken query for an installation that has the capability switched off, and hide the switch that makes the read succeed.

**Leaving the static template and capability-less page in place.** The add affordance would stay inert (`aria-disabled`) while the optional bundle makes creation real, and the fork's composition would expose no page for the Host's stored tasks, because upstream's task page lives in the row this composition omits.

## Consequences

- The page lists every retained Host task, active and inactive, behind a status filter and a search field, with each task's stored name, frequency, and next run; deletion asks in the row that acts and clears it only after an authoritative re-read confirms the removal; the run-history view merges saved delivery records for the newest twenty tasks, and the twelve-card template catalog stays below the list. A template card stages its own name, instruction, and recurrence in the same add-task dialog, which resolves a recurring seed's first run against the moment it opens, starts the conversation in the Workspace its picker names, and carries any interval of a minute or more.
- The add-task dialog's confirm sends the composed request into a fresh conversation, so the task exists once the model calls `schedule_create`; a refused or lost prompt leaves the request in that conversation.
- The per-task detail is this package's too: a selected row opens `src/client/TaskDetail.tsx`, which edits the stored name, instruction, and run time as one compare-and-update request, confirms deletion, lists the task's saved delivery records, and opens its original Session when the current metadata still calls it available.
- `src/client/schedule-format.ts`, `src/client/task-cron.ts`, `src/client/task-timing.ts`, `src/client/DatePicker.tsx`, `src/client/ClockPicker.tsx`, `src/client/TaskMenu.tsx`, and `src/client/DeliveryHistory.tsx` must be re-checked against upstream on every merge, and a change to any of them is ported to both surfaces by hand. `task-cron.ts` and `task-timing.ts` read a matched pattern's optional capture through a small typed reader, because the client compiler face types every capture as present while an absent group is `undefined` at run time.
- The shipped Web composition mounts no `schedule` row, so a default installation sees the `'unavailable'` state; enabling the optional bundle from the Plugins page turns the same page into the task list.
- Coverage pins the surface in `tests/catalog-source.client.spec.ts`, `tests/automation-page.client.spec.tsx`, `tests/automation-runs.client.spec.tsx`, `tests/task-detail.client.spec.tsx`, `tests/delivery-history.client.spec.tsx`, `tests/task-menu.client.spec.tsx`, `tests/date-picker.client.spec.tsx`, `tests/clock-picker.client.spec.tsx`, `tests/create-request.client.spec.ts`, `tests/apply.client.spec.ts`, and the formatter and timing specs.
