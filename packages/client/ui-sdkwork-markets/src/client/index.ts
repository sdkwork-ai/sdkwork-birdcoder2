/**
 * Markets mode plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) and
 * its market page into the keyed `mode.page` seat (declared by ui-layout's
 * frame), both keyed by the `markets` mode id. The page's header hosts the
 * market categories (Plugins, Experts, Skills, Connectors); each tab's panel
 * renders the SDKWork App Store market page through the host adapter
 * configured from the shared environment, IAM, and locale services. The add
 * affordances (create plugin / add plugin market) dispatch a composed prompt
 * into a fresh conversation through the sessions/workspaces services.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the sessions/workspaces Context merges (the prompt
// dispatch's services, provided by the runtime plugin).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ctx.env and ctx.iam into this program (the SDKWork host
// adapter's services).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {
  MarketsHostIam,
  MarketsHostTheme,
} from './marketsHost.ts'
import { configureMarketsHost } from './marketsHost.ts'
import { MarketsAction, type MarketsActionInjected } from './MarketsAction.tsx'
import { MarketsPage, type MarketsPageInjected } from './MarketsPage.tsx'
import { en, zh, type MarketsKey } from './locales.ts'

export type {
  MarketsActionInjected, MarketsActionProps,
} from './MarketsAction.tsx'
export type {
  MarketsPageInjected, MarketsPageProps,
} from './MarketsPage.tsx'
export type {
  MarketsHostAdapter, MarketsHostEnvironment, MarketsHostIam,
  MarketsHostLocale, MarketsHostSession, MarketsHostTheme,
  MarketsHostRenderSnapshot,
} from './marketsHost.ts'
export { toMarketsSession } from './marketsHost.ts'
export type { MarketsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Markets mode's copy (sidebar entry, tabs). */
    markets: MarketsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'markets'

/** Services required by the Markets mode plugin. */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'workspaces', 'env', 'iam', 'theme']

/** How long the create/add flows wait for the New Session connect to land a current session. */
const DISPATCH_TIMEOUT_MS = 15000

/**
 * Client plugin body: register the sidebar entry and the market page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-markets: dictionaries')

  // The SDKWork host adapter: the market pages read the active environment's
  // gateway (empty keeps the panel on its unconfigured face), the mounted IAM
  // session, and the host locale. Environment changes remount the App Store
  // runtime; IAM and locale changes propagate through host props.
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: MarketsHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = configureMarketsHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as MarketsHostIam,
    locale: ctx.locale,
    theme,
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-markets: SDKWork host adapter')

  // The create/add flows' execution channel: switch the frame to the
  // conversation surface, run the shared New Session flow, wait for the
  // fresh session to become current, then send the composed prompt into it.
  // The wait is bounded: a connect failure (or no Workspace at all) leaves
  // the frame on the conversation surface where the user can act directly.
  const dispatchPrompt = (text: string): void => {
    ctx.layout.setMode('code')
    const before = ctx.sessions.list.getSnapshot().current
    ctx.workspaces.startSession()
    const landed = new Promise<typeof before>((resolve) => {
      // finish hoists (a synchronous list tick cannot touch an uninitialized
      // binding); the timer lands before the subscription so any synchronous
      // tick finds both bindings live.
      function finish(value: typeof before): void {
        clearTimeout(timer)
        unsubscribe()
        resolve(value)
      }
      const timer = setTimeout(() => { finish(undefined) }, DISPATCH_TIMEOUT_MS)
      const unsubscribe = ctx.sessions.list.subscribe(() => {
        const current = ctx.sessions.list.getSnapshot().current
        if (current !== undefined && current !== before) finish(current)
      })
    })
    void landed.then(async (sessionId) => {
      if (sessionId === undefined) {
        console.warn('[markets] prompt dispatch skipped: no session landed')
        return
      }
      const scope = ctx.sessions.scope(sessionId)
      const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
      if (session === undefined) {
        console.warn(`[markets] prompt dispatch skipped: session ${sessionId} has no face`)
        return
      }
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) console.warn(`[markets] prompt dispatch failed: ${result.error.code}: ${result.error.message}`)
    }, (reason: unknown) => {
      console.warn('[markets] prompt dispatch failed:', reason)
    })
  }

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-markets',
    // Last in the quick-entry stack, behind Automation.
    order: 40,
    locale: NS,
    inject: (): MarketsActionInjected => ({
      // Open the market as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the market page renders in the center column.
      setMode: () => { ctx.layout.openPanel('markets') },
    }),
  }, MarketsAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'markets',
    locale: NS,
    inject: (): MarketsPageInjected => ({ mode: 'markets', dispatchPrompt }),
  }, MarketsPage))
}
