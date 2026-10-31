# Agent Note: Automation tasks are created through the Schedule Remote

Status: implemented

English | [中文](2026-10-31-automation-direct-task-create.zh.md)

## Problem

The Automation page's add-task dialog — the New action and every template card — created a task by dispatching a composed `schedule_create` request into a fresh conversation. That was the only path when the page was written: the Host exposed creation only as the model-facing tool. The Host now publishes the target-based Schedule capability as Remote methods, including `schedule/create`, and the model-mediated path fails in the shipped desktop build: the dispatch waits for the new Session to appear in the Session list and then resolves its face, but the id becomes listed before the client can mint its scope, so the plugin logged `[automation] prompt dispatch skipped: session … has no face` and the confirmed draft vanished — no message, no task. Even when it landed, the task's existence, title, instruction, and timing depended on the model transcribing the request, and the task reported into whichever conversation the dialog happened to open.

## Decision

The dialog's confirm is one `schedule/create` Remote write. `src/client/create-request.ts` maps the draft to `ScheduleCreateRequest`: the trimmed title, the instruction with the phrasing, validity, and push lines appended, the timing, and one `new_once` target whose `cwd` is the chosen Workspace's directory (the Host default when none is chosen). The timing uses the Host's own kinds — `at` for once, `daily`, `weekly`, `every` for the fixed rates, and a day-of-month `cron` for monthly — so the catalog states the rule in the design's words (`每天 09:00`, `仅一次`) and the task detail reopens every one of them for editing.

`src/client/index.ts` writes the request through `ctx.remote.schedule.create`, then re-reads the catalog with the request ordinal the catalog last observed, so the read cannot join one sent before the write, and returns the stored task. The page closes the dialog and selects the new row on that answer. A refused write keeps the dialog and its draft and states a localized correction: `not_future`, `invalid_prompt`, and the rule and zone codes map from `schedule/input-invalid`'s details, and a transport rejection is the unclassified failure. `draftReady` now also requires a non-empty instruction, because the Host refuses one.

Template seeds no longer strand the dialog: a one-shot that states no time stages one hour from now, and the checkup card stages its next 07:00, so no card opens a dialog whose confirm cannot be pressed. The two copy lines that contradicted their own rules were corrected: the interview card no longer claims workdays, which the interval rule cannot express, and the checkup card no longer names a past date.

The [Automation task surface note](2026-09-30-sdkwork-automation-task-surface.md) keeps the page-ownership decision; its creation paragraphs now point here.

## Alternatives considered

**Wait for the Session face instead of writing the task.** A retry until `scope()` resolves would make the dispatch more reliable, but creation would still depend on a model call that can decline, rephrase, or fail, so the template's timing, title, and target would stay unguaranteed, and every confirm would still spend a conversation and a model turn. The regression could not pin a created task's exact stored shape.

**Keep two creation paths: template cards through the model, New direct.** One dialog would then produce two different tasks from the same draft — different targets and different timing kinds — and the failure mode fixed here would survive in one of them.

**Add a new Remote method for creation.** Unnecessary: the Host's target-based capability already exports `schedule/create` (`@Remote('create')`) beside `catalog`, `edit`, `history`, and `run`, and the fork's page simply kept its earlier assumption that no write existed.

**Keep the monthly choice expressible in the dialog only through raw rule text.** The Host names no month-day timing kind, and the earlier composition spelled monthly as an RFC 5545 rule; that rule was neither designed copy in the list nor editable in the detail. The five-field cron `M H D * *` is the same day-of-month statement, reads through the cron formatter, and is the shape the detail's monthly builder owns.

## Consequences

- One Remote write per confirm: no conversation starts and no model call is spent, and a template confirm shows its row immediately after the write's readback.
- A refused write keeps the dialog, the draft, and the correction, and the dialog disables both buttons while the write is in flight.
- Created tasks always report into a conversation the Host creates at first delivery and reuses, so a template's follow-ups read as one thread. The row's target and the detail say so; the dialog cannot point a task at the author's current conversation.
- Rows created from every frequency read as the designed frequency text instead of a raw rule, and their detail reopens the timing for editing — the monthly choice included, through the day-of-month cron the builder recognizes.
- The markets create flows still dispatch a composed prompt into a fresh conversation; this decision covers the Automation surface only.
- Coverage: `tests/apply.client.spec.ts` (the write, the readback ordering, and every refusal mapping), `tests/create-request.client.spec.ts` (the timing per frequency and the target), `tests/automation-page.client.spec.tsx` (staging, refusal in place, selection of the stored row), `tests/AutomationCreateModal.client.spec.tsx` (pending and failure states), and `tests/template-seeds.client.spec.ts` (no seed opens with a disabled confirm).

## Verification

In the desktop development build, a template card staged its seed and confirm stored the task; the list then showed it with the designed frequency text. A one-shot whose run time was set two minutes ahead delivered at that occurrence into a newly created conversation: its Session log carries the `[SCHEDULE REMINDER]` message with the stored instruction, the assistant's reply, and `turn/end`, while the stored task reads `status: "ended"` with its delivery receipt, and the page states 已结束 on its next read. The package's own suite (`pnpm exec vitest run packages/client/ui-sdkwork-automation`, 531 tests) and its `tsc -b` project cover the request shape, the failure mapping, and the dialog states without a live Host.
