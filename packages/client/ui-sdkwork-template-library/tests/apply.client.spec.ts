// @vitest-environment jsdom
/** ui-sdkwork-template-library apply wiring: the sidebar quick entry (ordered
 * below the market entry) and the page keyed by the `template-library` mode
 * id, registered once their slot declarations are on the ledger; teardown
 * cascades. The host adapter's own face is covered by the host spec. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-template-library/client'
import type { TemplateLibraryPageInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-template-library/client'
import { TemplateLibraryAction } from '../src/client/TemplateLibraryAction.tsx'
import { TemplateLibraryPage } from '../src/client/TemplateLibraryPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
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
  // The install port's services: absent in production compositions without
  // the deploy plugin, present here so the page injection carries the port.
  const uiWorkspace = { pickDirectory: vi.fn(async () => null) }
  ctx.provide('uiWorkspace', uiWorkspace)
  const deployPublish = {
    host: {
      readClients: () => ({
        deployClient: {
          template: {
            marketplaceTemplates: {
              list: vi.fn(async () => ({ items: [{ id: 'tpl-1', displayName: 'D', templateKey: 'd', version: '0.1.0' }] })),
            },
          },
        },
      }),
    },
    installTemplate: vi.fn(async () => ({ fileCount: 1 })),
  }
  ctx.provide('deployPublish', deployPublish)
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

describe('ui-sdkwork-template-library apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'env', 'iam', 'theme', 'uiWorkspace', 'deployPublish'])
  })

  it('registers the sidebar entry and the page keyed by the template-library mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-template-library')
    // Below the market entry (order 40), last in the quick-entry stack.
    expect(action?.options.order).toBe(50)
    expect(action?.component).toBe(TemplateLibraryAction)
    expect(action?.locale).toBe('template-library')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('template-library')
    expect(page?.component).toBe(TemplateLibraryPage)
    const injected = (page!.inject as unknown as () => TemplateLibraryPageInjected)()
    expect(injected.mode).toBe('template-library')
    // The install port rides the injection: search/install callbacks over the
    // deploy plugin's service, and the workspace directory picker.
    expect(typeof injected.deployTemplates?.search).toBe('function')
    expect(typeof injected.deployTemplates?.install).toBe('function')
    expect(typeof injected.deployTemplates?.pickDirectory).toBe('function')
    // The page is public: its injection carries no IAM session face.
    expect('authGate' in injected).toBe(false)
  })

  it('opens the code-surface overlay through the layout panel channel', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    const injected = (action!.inject as unknown as () => { setMode: () => void })()
    // The overlay write, not a mode switch: the code rail entry keeps its
    // highlight while the template library renders in the center column.
    injected.setMode()
    expect(b.layout.openPanel).toHaveBeenCalledWith('template-library')
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
