// @vitest-environment jsdom
/** ui-sdkwork-demand-hall apply wiring: the sidebar quick entry (ordered
 * below the template-library entry) and the page keyed by the `demand-hall`
 * mode id, registered once their slot declarations are on the ledger;
 * teardown cascades. The host adapter's own face is covered by the host spec. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as hostApply } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall/client'
import type { DemandHallPageInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-demand-hall/client'
import { DemandHallAction } from '../src/client/DemandHallAction.tsx'
import { DemandHallPage } from '../src/client/DemandHallPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.locale.setLocale('zh')
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
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
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the sidebar shell and the frame: the root declares the
    // sidebar seat and the keyed page seat, the shell entry declares the
    // actions list seat.
    slots.register(
      { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'sidebar', children: { [ACTIONS]: { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, layout }
}

describe('ui-sdkwork-demand-hall apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'env', 'iam', 'theme'])
  })

  it('keeps the host loader entry behavior-free', () => {
    expect(() => hostApply()).not.toThrow()
  })

  it('registers the sidebar entry and the page keyed by the demand-hall mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-demand-hall')
    // Below the template-library entry (order 50), last in the quick-entry stack.
    expect(action?.options.order).toBe(51)
    expect(action?.component).toBe(DemandHallAction)
    expect(action?.locale).toBe('demand-hall')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('demand-hall')
    expect(page?.component).toBe(DemandHallPage)
    const injected = (page!.inject as unknown as () => DemandHallPageInjected)()
    expect(injected.mode).toBe('demand-hall')
    // The page is public: its injection carries no IAM session face.
    expect('authGate' in injected).toBe(false)
  })

  it('opens the code-surface overlay through the layout panel channel', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    const injected = (action!.inject as unknown as () => { setMode: () => void })()
    // The overlay write, not a mode switch: the code rail entry keeps its
    // highlight while the demand hall renders in the center column.
    injected.setMode()
    expect(b.layout.openPanel).toHaveBeenCalledWith('demand-hall')
    expect(b.layout.setMode).not.toHaveBeenCalled()
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(ACTIONS)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(ACTIONS)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
