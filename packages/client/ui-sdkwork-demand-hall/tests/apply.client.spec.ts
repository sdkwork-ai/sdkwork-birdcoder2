// @vitest-environment jsdom
/** ui-sdkwork-demand-hall apply wiring: the left-sidebar page registered
 * through `ctx.sdkworkSidebar` (ordered below the template-library entry) and
 * the page keyed by the `demand-hall` mode id, registered once their seat
 * declarations are on the ledger; teardown cascades. The host adapter's own
 * face is covered by the host spec. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as hostApply } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall/client'
import type { DemandHallPageInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall/client'
import { DemandHallPage } from '../src/client/DemandHallPage.tsx'

const PAGE = 'mode.page'

/** One page the plugin registered, captured through the double below. */
interface RegisteredPage {
  id: string
  order: number
  title: string | (() => string)
  open: () => void
}

/**
 * Minimal double of the left sidebar's page registry: records pages and
 * removes them on disposal, exactly the two facts this spec asserts.
 */
function pageRegistryDouble() {
  const pages = new Map<string, RegisteredPage>()
  const disposers: Array<() => void> = []
  return {
    pages,
    disposers,
    service: {
      registerPage(page: RegisteredPage) {
        pages.set(page.id, page)
        const dispose = () => { pages.delete(page.id) }
        disposers.push(dispose)
        return dispose
      },
      getPages: () => [...pages.values()],
      subscribe: () => () => {},
      refreshTitles: () => {},
    },
  }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.locale.setLocale('zh')
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
  const registry = pageRegistryDouble()
  ctx.provide('sdkworkSidebar', registry.service)
  // The SDKWork host adapter doubles: the adapter never mounts its App Store
  // runtime in this spec, so only the service keys the apply body reads.
  const env = {
    apiBaseUrl: () => '',
    accessToken: () => '',
    subscribe: () => () => {},
  }
  ctx.provide('env', env)
  const iam = {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
  ctx.provide('iam', iam)
  const theme = {
    getTheme: () => ({ active: { colorScheme: 'light' as const } }),
  }
  ctx.provide('theme', theme)
  // The demand → project port drives these two services; this spec never runs
  // a bootstrap, so only the keys the apply body closes over are needed.
  ctx.provide('workspaces', {
    pickDirectory: async () => null,
    createDirectory: async () => '',
    create: async () => ({ workspaceId: 'ws' }),
    connectWorkspace: async () => 'session',
    rename: async () => ({}),
  })
  ctx.provide('sessions', {
    open: () => {},
    binding: () => undefined,
  })
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the frame: the root declares the sidebar seat and the
    // keyed page seat.
    slots.register(
      { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, layout, registry }
}

describe('ui-sdkwork-demand-hall apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'layout', 'env', 'iam', 'theme', 'sessions', 'workspaces', 'sdkworkSidebar',
    ])
  })

  it('keeps the host loader entry behavior-free', () => {
    expect(() => { hostApply() }).not.toThrow()
  })

  it('registers one sidebar page below the template-library entry', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = [...b.registry.pages.values()]
    expect(page?.id).toBe('sdkwork-demand-hall')
    // Below the template-library entry (order 50), last in the page stack.
    expect(page?.order).toBe(51)
    // The registry re-resolves a function title through the locale namespace.
    const title = page?.title
    expect(typeof title).toBe('function')
    expect(typeof title === 'function' ? title() : title).toBe('需求大厅')

    const [modePage] = b.slots.entries(PAGE)
    expect(modePage?.options.key).toBe('demand-hall')
    expect(modePage?.component).toBe(DemandHallPage)
    const injected = (modePage.inject as () => DemandHallPageInjected)()
    expect(injected.mode).toBe('demand-hall')
    // The page is public: its injection carries no IAM session face.
    expect('authGate' in injected).toBe(false)
  })

  it('opens the code-surface overlay through the layout panel channel', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = [...b.registry.pages.values()]
    // The overlay write, not a mode switch: the code rail entry keeps its
    // highlight while the demand hall renders in the center column.
    page?.open()
    expect(b.layout.openPanel).toHaveBeenCalledWith('demand-hall')
    expect(b.layout.setMode).not.toHaveBeenCalled()
  })

  it('teardown removes the page and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.registry.pages.size).toBe(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.registry.pages.size).toBe(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
