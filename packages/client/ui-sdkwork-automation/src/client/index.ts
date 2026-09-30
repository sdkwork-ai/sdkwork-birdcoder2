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
 * The add-task dialog has no Remote write behind it: creation exists only as the
 * model-facing `schedule_create` tool, so confirm composes a request naming the
 * exact arguments and dispatches it into a fresh conversation through the
 * sessions and workspaces services.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the sessions Context merge (the dispatch's session list and
// per-session prompt face, provided by the runtime plugin) and the uiWorkspace
// Context merge (the shared New Session flow).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the uiWorkspace service the shared New Session flow drives.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: the `connection/reset` event this plugin re-reads the catalog on.
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: the Session identity the create channel's dispatch waits for.
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: the ctx.remote Context merge and the forwarded `schedule/changed`
// event selection.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AutomationAction, type AutomationActionInjected } from './AutomationAction.tsx'
import { AutomationPage, type AutomationPageInjected } from './AutomationPage.tsx'
import { createCatalogSource, type CatalogInjected } from './catalog-source.ts'
import { createTaskPrompt, type AutomationDraft, type CreateWorkspaceId } from './create-request.ts'
import { sessionLinkState } from './session-link.ts'
import { en, NS, zh, type AutomationKey } from './locales.ts'
import type { ScheduleUpdateRequest } from '@deepseek-ai/dsh-schedule/client'

export type { AutomationActionInjected, AutomationActionProps } from './AutomationAction.tsx'
export type { AutomationPageInjected, AutomationPageProps, AutomationTab } from './AutomationPage.tsx'
export type { AutomationCreateModalProps } from './AutomationCreateModal.tsx'
export type {
  AutomationCreateSeed, AutomationDraft, CreateFrequency, CreateIntervalUnit, CreateStyle, CreateValidity,
  CreateWorkspaceId, CreateWorkspaceOption,
} from './create-request.ts'
export type { CatalogDeleteOutcome, CatalogSnapshot, CatalogStatus } from './catalog-source.ts'
export type { AutomationKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Automation mode's copy (sidebar entry, page, task list, and dialog). */
    automation: AutomationKey
  }
}

/**
 * How long a dispatched request waits for the new Session to become current
 * before giving up. The frame is already on the conversation surface by then, so
 * a timeout costs the request, not the user's ability to type it again.
 */
export const DISPATCH_TIMEOUT_MS = 15_000

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
      // A row the catalog no longer holds states its own removal; the Host's
      // `delete` also needs the task's original Session binding.
      if (record === undefined) {
        return Promise.resolve({ ok: true, value: { id, deleted: false, code: 'schedule_not_found' } })
      }
      return ctx.remote.schedule.delete({ sessionId: record.sessionId, id })
    },
    subscribeChanged: listener => ctx.remote.$on('schedule/changed', listener),
    subscribeReset: listener => ctx.on('connection/reset', listener),
  })

  // One compare-and-update request, followed by the authoritative readback it
  // needs: an accepted write, a conflict, an ended task, and a task the Host no
  // longer holds all moved the durable state, so the catalog re-reads instead of
  // joining a read that may have been sent before the write.
  const updateTask = async (request: ScheduleUpdateRequest) => {
    const result = await ctx.remote.schedule.update(request)
    if (result.ok && ('record' in result.value
      || result.value.code === 'schedule_conflict'
      || result.value.code === 'schedule_ended'
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

  // The create channel: close the overlay, run the shared New Session flow, wait
  // for the fresh session to appear, then send the composed request into it. The
  // wait is bounded, and a failure leaves the frame on the conversation surface
  // where the user can act directly.
  const dispatchPrompt = (text: string, workspaceId?: CreateWorkspaceId): void => {
    const sessions = ctx.sessions
    ctx.layout.closePanel()
    // The landed session is the id that was not in the list before the flow
    // started: both Session-list contracts the client builds carry `ids`, so the
    // wait needs no selection field the mounted service may not expose.
    const before = new Set(sessions.list.getSnapshot().ids)
    // The dialog's workspace decides where the conversation starts; without one
    // the shared New Session flow keeps its own default.
    ctx.uiWorkspace.startSession(workspaceId ?? undefined)
    const landed = new Promise<SessionId | undefined>((resolve) => {
      // finish hoists (a synchronous list tick cannot touch an uninitialized
      // binding); the timer lands before the subscription so any synchronous
      // tick finds both bindings live.
      function finish(value: SessionId | undefined): void {
        clearTimeout(timer)
        unsubscribe()
        resolve(value)
      }
      const timer = setTimeout(() => { finish(undefined) }, DISPATCH_TIMEOUT_MS)
      const unsubscribe = sessions.list.subscribe(() => {
        const arrived = sessions.list.getSnapshot().ids.find(id => !before.has(id))
        if (arrived !== undefined) finish(arrived)
      })
    })
    void (async () => {
      const sessionId = await landed
      if (sessionId === undefined) {
        console.warn('[automation] prompt dispatch skipped: no session landed')
        return
      }
      const scope = sessions.scope(sessionId)
      const session = scope === undefined ? undefined : sessions.sessionOf(scope)
      if (session === undefined) {
        console.warn(`[automation] prompt dispatch skipped: session ${sessionId} has no face`)
        return
      }
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) console.warn(`[automation] prompt dispatch failed: ${result.error.code}: ${result.error.message}`)
    })().catch((reason: unknown) => {
      // A rejected prompt never reached the conversation, so the request is lost
      // rather than queued; the frame is already on the conversation surface.
      console.warn('[automation] prompt dispatch failed:', reason)
    })
  }

  const createTask = (draft: AutomationDraft): void => {
    // The dialog cannot submit a draft without a run time; a caller that hands
    // one over directly is refused here rather than sending a request the model
    // would have to repair.
    const text = createTaskPrompt(draft, Intl.DateTimeFormat().resolvedOptions().timeZone, t)
    if (text === undefined) return
    dispatchPrompt(text, draft.workspaceId)
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
      loadHistory: request => ctx.remote.schedule.history(request),
    }),
  }, AutomationPage))
}
