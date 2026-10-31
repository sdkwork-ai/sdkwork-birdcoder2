/**
 * Automation mode plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar), its page
 * into the keyed `mode.page` seat (declared by ui-layout's frame) under the
 * `automation` mode id, and the Host Schedule catalog the page reads.
 *
 * The page owns the product's scheduled-task surface; the Host owns the tasks.
 * One catalog source serves the page, so its reads follow its subscribers and
 * any number of mounted views costs one `schedule/catalog` query. The sidebar
 * entry opens the page as a code-surface overlay, which is why its action drives
 * `openPanel` rather than a mode switch.
 *
 * Creation is one `schedule/create` Remote write: the add-task dialog is the
 * whole creation path, so a confirmed draft becomes a stored task without
 * starting a conversation or calling a model. The page reads the catalog back
 * after an accepted write, so the new task appears without waiting for the
 * `schedule/changed` notice.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the sessions Context merge (the task's linked-conversation
// lookup) and the uiWorkspace Context merge (the shared open-Session action).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the uiWorkspace service the linked-conversation action drives.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: the `connection/reset` event this plugin re-reads the catalog on.
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: the Session identity the task rows link to.
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: the ctx.remote Context merge and the forwarded `schedule/changed`
// event selection.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AutomationAction, type AutomationActionInjected } from './AutomationAction.tsx'
import { AutomationPage, type AutomationPageInjected } from './AutomationPage.tsx'
import { createCatalogSource, type CatalogInjected } from './catalog-source.ts'
import {
  createFailure, scheduleCreateRequest,
  type AutomationDraft,
  type CreateTaskOutcome,
} from './create-request.ts'
import { sessionLinkState } from './session-link.ts'
import { en, NS, zh, type AutomationKey } from './locales.ts'
import type { RunTaskOutcome, SetActiveOutcome } from './row-actions.ts'
import type { ScheduleCatalogEntry, ScheduleEditRequest } from '@deepseek-ai/dsh-schedule/client'

export type { AutomationActionInjected, AutomationActionProps } from './AutomationAction.tsx'
export type { AutomationPageInjected, AutomationPageProps, AutomationTab } from './AutomationPage.tsx'
export type { AutomationCreateModalProps } from './AutomationCreateModal.tsx'
export type {
  AutomationCreateSeed, AutomationDraft, CreateFrequency, CreateIntervalUnit, CreateStyle, CreateTaskFailure,
  CreateTaskOutcome, CreateValidity, CreateWorkspaceId, CreateWorkspaceOption,
} from './create-request.ts'
export type { RunAvailability, RunBlock, RunRefusal, RunTaskOutcome, SetActiveOutcome } from './row-actions.ts'
export type { CatalogDeleteOutcome, CatalogSnapshot, CatalogStatus } from './catalog-source.ts'
export type { AutomationKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Automation mode's copy (sidebar entry, page, task list, and dialog). */
    automation: AutomationKey
  }
}

/** Services required by the Automation mode plugin. */
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.schedule', 'sessions', 'workspaces', 'uiWorkspace']

/**
 * Client plugin body: register the dictionaries, the catalog, the sidebar entry,
 * and the page, and wire the dialog's create channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-automation: dictionaries')
  const t = ctx.locale.bind(NS)

  const catalog: CatalogInjected = createCatalogSource({
    list: () => ctx.remote.schedule.catalog(),
    remove: (id) => {
      const record = catalog.hooks.catalog.getSnapshot().records.find(item => item.id === id)
      // A row the catalog no longer holds states its own removal. A deletion is
      // the edit action of the same request, and the revision the catalog read
      // is what keeps it from removing a task someone else just changed.
      if (record === undefined) {
        return Promise.resolve({ ok: true, value: { id, deleted: false, code: 'schedule_not_found' } })
      }
      return ctx.remote.schedule.edit({
        id, action: 'delete', expectedUpdatedAt: record.updatedAt ?? null,
      }).then(result => (!result.ok || 'deleted' in result.value
        ? result
        : { ok: true as const, value: { id, deleted: false as const, code: 'schedule_not_found' as const } }))
    },
    subscribeChanged: listener => ctx.remote.$on('schedule/changed', listener),
    subscribeReset: listener => ctx.on('connection/reset', listener),
  })

  // One closed edit, followed by the authoritative readback it needs: an
  // accepted write, a completed deletion, a conflict, and a task the Host no
  // longer holds all moved the durable state, so the catalog re-reads instead of
  // joining a read that may have been sent before the write.
  const updateTask = async (request: ScheduleEditRequest) => {
    const result = await ctx.remote.schedule.edit(request)
    if (result.ok && (!('code' in result.value)
      || result.value.code === 'schedule_conflict'
      || result.value.code === 'schedule_not_found')) {
      await catalog.onRetry(catalog.hooks.catalog.getSnapshot().readRequest)
    }
    return result
  }

  // One retained task's original conversation opens only while the current
  // Session and Workspace metadata still call it available: browsing a task's
  // link never unarchives the Session it belongs to.
  const openSession = (id: SessionId): void => {
    const sessions = ctx.sessions.list.getSnapshot()
    if (sessionLinkState(id, sessions, ctx.workspaces.list.getSnapshot()) === 'available') {
      ctx.uiWorkspace.openSession(id)
    }
  }

  // The create channel: one Remote write, followed by the authoritative read
  // the page shows. A refused write reports the correction the dialog can make,
  // so a failed confirm keeps the draft instead of losing it.
  const createTask = async (draft: AutomationDraft): Promise<CreateTaskOutcome> => {
    // The dialog cannot submit a draft without a run time; a caller that hands
    // one over directly is refused here rather than sending a request the Host
    // would have to repair.
    const request = scheduleCreateRequest(
      draft, Intl.DateTimeFormat().resolvedOptions().timeZone, t,
    )
    if (request === undefined) return { failed: 'rule' }
    let result: Awaited<ReturnType<typeof ctx.remote.schedule.create>>
    try {
      result = await ctx.remote.schedule.create(request)
    } catch (_error: unknown) {
      // A rejected call leaves the write's outcome unknown, so it is reported
      // like an unclassified Host failure and the draft stays.
      return { failed: 'host' }
    }
    if (!result.ok) {
      return {
        failed: result.error.code === 'schedule/input-invalid' ? createFailure(result.error.details.code) : 'host',
      }
    }
    // The write moved the durable set, so this read must not join one that was
    // sent before it: naming every request seen so far makes the source issue a
    // new one.
    await catalog.onRetry(catalog.hooks.catalog.getSnapshot().readRequest)
    return { created: result.value }
  }

  // Run now is one Remote call: the Host admits the delivery, then the readback
  // shows the execution slot or the interval it now holds. A refusal keeps the
  // row as it was and says which one applies.
  const runTask = async (id: ScheduleCatalogEntry['id']): Promise<RunTaskOutcome> => {
    let result: Awaited<ReturnType<typeof ctx.remote.schedule.run>>
    try {
      result = await ctx.remote.schedule.run({ id })
    } catch (_error: unknown) {
      return { queued: false, code: 'failed' }
    }
    if (!result.ok) {
      return { queued: false, code: result.error.code === 'schedule/target-archived' ? 'archived' : 'failed' }
    }
    await catalog.onRetry(catalog.hooks.catalog.getSnapshot().readRequest)
    return 'code' in result.value
      ? { queued: false, code: result.value.code === 'schedule_execution_pending' ? 'pending' : 'missing' }
      : { queued: true }
  }

  // Pause and resume are one closed edit each, carrying the revision the row was
  // read at so a task someone else changed comes back refused instead of
  // overwriting them.
  const setActive = async (task: ScheduleCatalogEntry, active: boolean): Promise<SetActiveOutcome> => {
    try {
      const result = await updateTask({
        id: task.id, action: 'update', patch: { active }, expectedUpdatedAt: task.updatedAt ?? null,
      })
      return result.ok && !('code' in result.value) ? { saved: true } : { saved: false }
    } catch (_error: unknown) {
      return { saved: false }
    }
  }

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-automation',
    // Behind Pull Request, ahead of the market entry.
    order: 30,
    locale: NS,
    inject: (): AutomationActionInjected => ({
      // Open Automation as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the automation page renders in the center column.
      setMode: () => { ctx.layout.openPanel('automation') },
    }),
  }, AutomationAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'automation',
    locale: NS,
    inject: (): AutomationPageInjected => ({
      mode: 'automation',
      hooks: catalog.hooks,
      onRetry: catalog.onRetry,
      onDelete: catalog.onDelete,
      onUpdateTiming: updateTask,
      onOpenSession: openSession,
      onCreateTask: createTask,
      onRunTask: runTask,
      onSetActive: setActive,
      loadHistory: request => ctx.remote.schedule.history(request),
    }),
  }, AutomationPage))
}
