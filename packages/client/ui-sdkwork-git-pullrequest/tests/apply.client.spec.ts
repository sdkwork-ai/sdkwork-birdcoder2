/** ui-sdkwork-git-pullrequest apply wiring: the sidebar quick entry and the
 * placeholder page, the page keyed by the `pull-request` mode id, registered
 * once their slot declarations are on the ledger; teardown cascades. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-git-pullrequest/client'
import type {
  PullRequestActionInjected, PullRequestPageInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-git-pullrequest/client'
import { PullRequestAction } from '../src/client/PullRequestAction.tsx'
import { PullRequestPage } from '../src/client/PullRequestPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
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

describe('ui-sdkwork-git-pullrequest apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('registers the sidebar entry and the page keyed by the pull-request mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-git-pullrequest')
    expect(action?.options.order).toBe(20)
    expect(action?.component).toBe(PullRequestAction)
    expect(action?.locale).toBe('pullRequest')
    const injected = (action!.inject as unknown as () => PullRequestActionInjected)()
    injected.setMode()
    // The entry opens the module as a code-surface overlay: the rail selection
    // stays `code` (the code rail entry keeps its highlight), so it drives
    // openPanel rather than a mode switch.
    expect(b.layout.openPanel).toHaveBeenCalledWith('pull-request')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('pull-request')
    expect(page?.component).toBe(PullRequestPage)
    expect((page!.inject as unknown as () => PullRequestPageInjected)().mode).toBe('pull-request')
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
