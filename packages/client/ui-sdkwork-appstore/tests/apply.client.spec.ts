// @vitest-environment jsdom
/** ui-sdkwork-appstore apply wiring: the sidebar quick entry, the rail entry,
 * and the SDKWork page, each keyed by the `appstore` mode id, register once
 * their slot declarations are on the ledger; the host adapter and slot
 * contributions tear down together. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-appstore/client'
import type {
  AppStorePageInjected, AppStoreRailEntryInjected, SidebarActionInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-appstore/client'
import { AppStoreRailEntry } from '../src/client/RailEntry.tsx'
import { AppStorePage } from '../src/client/AppStorePage.tsx'
import { SidebarAction } from '../src/client/SidebarAction.tsx'

const ACTIONS = 'sidebar.actions'
const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeEnv() {
  return {
    apiBaseUrl: () => 'https://fixture.example',
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

function fakeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  ctx.provide('theme', { getSnapshot: () => ({ value: { preference: 'light' } }), subscribe: () => () => {}, set: async () => {} } as never)
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    // Stand in for the sidebar shell and the mode rail shell: the root
    // declares the sidebar seat and the keyed page seat, and each shell
    // declares the entry seat it renders.
    slots.register(
      { name: 'root', children: { sidebar: { kind: 'single', scope: 'root' }, 'mode.rail': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'sidebar', children: { [ACTIONS]: { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'mode.rail', children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, layout }
}

describe('ui-sdkwork-appstore apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'env', 'iam', 'theme'])
  })

  it('registers the sidebar entry, the rail entry, and the page keyed by the appstore mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-appstore')
    expect(action?.options.order).toBe(20)
    expect(action?.component).toBe(SidebarAction)
    expect(action?.locale).toBe('appstore')
    // The injected face is the entry's whole capability: it writes the frame's
    // mode, so clicking the row lands on the same surface the rail selects.
    const actionFace: unknown = action?.inject?.()
    const injected = actionFace as SidebarActionInjected
    injected.setMode()
    expect(b.layout.setMode).toHaveBeenCalledWith('appstore')

    const [entry] = b.slots.entries(RAIL_ENTRY)
    expect(entry?.options.key).toBe('appstore')
    expect(entry?.component).toBe(AppStoreRailEntry)
    expect(entry?.locale).toBe('appstore')
    expect((entry!.inject as unknown as () => AppStoreRailEntryInjected)().mode).toBe('appstore')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('appstore')
    expect(page?.component).toBe(AppStorePage)
    expect((page!.inject as unknown as () => AppStorePageInjected)().mode).toBe('appstore')
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(ACTIONS)).toHaveLength(1)
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(ACTIONS)).toHaveLength(0)
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
