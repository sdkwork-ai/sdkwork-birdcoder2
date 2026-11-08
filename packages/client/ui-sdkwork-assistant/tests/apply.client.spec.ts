// @vitest-environment jsdom
/**
 * Assistant surface apply wiring: the 助理 rail entry registers only while the
 * Bot plugin publishes `ctx.botSurface`, the rail selection and that surface
 * choice stay one fact in both directions, and disposal removes the entry and
 * stops the binding.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { AppModeId, ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ASSISTANT_MODE, apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-assistant/client'
import type { BotSurface, BotSurfaceMode } from '@deepseek-ai/dsh-client-ui-sdkwork-assistant/client'
import { AssistantRailEntry } from '../src/client/RailEntry.tsx'

const RAIL = 'mode.rail.entry'

/** The frame's rail selection plus the write the frame's own rail uses. */
function fakeLayout() {
  const mode = createSnapshotStore<AppModeId>('code')
  const layout = {
    mode,
    setMode: (next: AppModeId) => { mode.set(next) },
  } as unknown as ILayout
  return { layout, mode }
}

/** The Bot plugin's published surface choice. */
function fakeBotSurface(initial: BotSurfaceMode) {
  const mode = createSnapshotStore<BotSurfaceMode>(initial)
  const set = vi.fn((next: BotSurfaceMode) => { mode.set(next) })
  return { surface: { mode, set } as BotSurface, mode, set }
}

async function bench({ withBot = true, surface = 'bot' as BotSurfaceMode } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const frame = fakeLayout()
  ctx.provide('layout', frame.layout)
  const bot = fakeBotSurface(surface)
  if (withBot) ctx.provide('botSurface', bot.surface)
  const slots = ctx.get('slots') as unknown as SlotRegistry
  slots.register(
    { name: 'root', children: { 'mode.rail': { kind: 'single', scope: 'root' } } } as never,
    () => null,
  )
  slots.register({ name: 'mode.rail', children: { [RAIL]: { kind: 'keyed', scope: 'root' } } } as never, () => null)
  return { ctx, slots, railMode: frame.mode, surfaceMode: bot.mode, set: bot.set }
}

describe('ui-sdkwork-assistant apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('registers the 助理 rail entry once the Bot surface service is available', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const [entry] = b.slots.entries(RAIL)
    expect(entry?.options.key).toBe('assistant')
    expect(entry?.component).toBe(AssistantRailEntry)
    expect(entry?.locale).toBe('assistant')
    const face = (entry!.inject as unknown as () => { mode: AppModeId })()
    expect(face.mode).toBe(ASSISTANT_MODE)
  })

  it('withdraws the remembered Bot surface on the boot Home selection', async () => {
    // The plugin remembered the Bot surface, but the frame starts on Home.
    const b = await bench({ surface: 'bot' })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.railMode.getSnapshot()).toBe('code')
    expect(b.surfaceMode.getSnapshot()).toBe('agent')
  })

  it('follows the rail in both directions', async () => {
    const b = await bench({ surface: 'agent' })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.surfaceMode.getSnapshot()).toBe('agent')

    // Rail to surface: the 助理 entry selection paints the Bot team.
    b.railMode.set('assistant')
    expect(b.surfaceMode.getSnapshot()).toBe('bot')
    expect(b.set).toHaveBeenLastCalledWith('bot')

    // Surface to rail: the plugin's own return control lands on Home.
    b.surfaceMode.set('agent')
    expect(b.railMode.getSnapshot()).toBe('code')

    // Any other rail mode withdraws the Bot surface too.
    b.railMode.set('video')
    expect(b.surfaceMode.getSnapshot()).toBe('agent')
  })

  it('contributes nothing, and forces no surface, when the Bot plugin is absent', async () => {
    const b = await bench({ withBot: false })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    // The pending fiber never binds: the remembered surface stays as it was.
    expect(b.surfaceMode.getSnapshot()).toBe('bot')
    expect(b.set).not.toHaveBeenCalled()
  })

  it('teardown removes the entry and stops the binding', async () => {
    const b = await bench({ surface: 'agent' })
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    b.railMode.set('assistant')
    expect(b.surfaceMode.getSnapshot()).toBe('agent')
  })
})
