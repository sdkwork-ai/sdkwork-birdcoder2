// @vitest-environment jsdom
/**
 * Registration coverage for the Input history browser half: the settings
 * section contribution, its injected preference writes, the accepted-input
 * listener, the fixed-input observer, and fiber teardown (HMR safety).
 *
 * The plugin is mounted over the real slot registry, locale runtime, and
 * Cordis event bus; only the Session/conversation/shortcuts services are
 * stand-ins, because the assertions are about what this plugin registers and
 * writes, not about another package's internals.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutFixedInput } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import type { InputHistorySettingsInjected } from '../src/client/InputHistorySection.tsx'
import { INPUT_HISTORY_STORAGE_KEY, createInputHistoryStore } from '../src/client/input-history-store.ts'

/** A Session id brand for fixtures. */
function sid(id: string): SessionId {
  return id as SessionId
}

/** A shortcuts service stand-in that records fixed-input observers. */
function shortcutsOf() {
  const listeners = new Set<(input: ShortcutFixedInput) => void>()
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  return {
    service: {
      observeFixedInput: (listener: (input: ShortcutFixedInput) => void) => {
        listeners.add(listener)
        const dispose = vi.fn(() => { listeners.delete(listener) })
        disposers.push(dispose)
        return dispose
      },
    } as never,
    listeners,
    disposers,
  }
}

/** Mount the browser half over the real registries and stand-in services. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: [sid('s1')],
        byId: { [sid('s1')]: { cwd: '/work/project' } },
        phase: 'ready',
        projectionsBySession: {},
      }),
      subscribe: () => () => {},
    },
    scope: (id: SessionId) => ({ session: id }),
  } as never
  ctx.provide('sessions' as never, sessions)
  const conversation = {
    input: { for: () => { throw new Error('composer facade unused in this spec') } },
  } as never
  ctx.provide('conversation' as never, conversation)
  const shortcuts = shortcutsOf()
  ctx.provide('shortcuts' as never, shortcuts.service)
  const slots = ctx.get('slots') as SlotRegistry
  // The settings shell owns the declaration; this stands in for it so the
  // contribution's own `slots.inject` has something to wait for.
  slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const plugin = ctx.plugin({ inject: [...inject], apply })
  await plugin.await()
  const entry = slots.entries('settings.section').find(candidate => candidate.options.id === 'input-history')
  if (entry === undefined) throw new Error('settings section not registered')
  if (entry.inject === undefined) throw new Error('settings section carries no inject face')
  const face: unknown = entry.inject
  if (typeof face !== 'function') throw new Error('settings section inject face is not callable')
  const injected = (face as () => InputHistorySettingsInjected)()
  return { ctx, plugin, slots, entry, injected, shortcuts }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('input history browser half', () => {
  it('contributes one settings section with localized navigation copy', async () => {
    const { entry, ctx } = await bench()

    expect(entry.options.id).toBe('input-history')
    expect(entry.options.order).toBe(25)
    expect(resolveSlotLabel(entry.options.label)).toBeTruthy()
    await ctx.fiber.dispose()
  })

  it('publishes the ledger through the injected history source', async () => {
    const { injected, ctx } = await bench()

    expect(injected.hooks.history.getSnapshot().settings).toMatchObject({
      enabled: true,
      scope: 'session',
      retentionDays: 30,
    })
    expect(injected.hooks.history.getSnapshot().entries).toEqual([])
    // The count copy is a real interpolated dictionary entry, not a template
    // the component assembles itself.
    expect(ctx.locale.bind('inputHistory')('count', { count: 2 })).toContain('2')
    await ctx.fiber.dispose()
  })

  it('records every Host-accepted message and ends the walk', async () => {
    const { ctx, injected } = await bench()

    ctx.emit('conversation/input-accepted', {
      sessionId: sid('s1'),
      text: 'first input',
      submittedAt: Date.UTC(2026, 10, 19),
    })
    ctx.emit('conversation/input-accepted', {
      sessionId: sid('s1'),
      text: 'second input',
      submittedAt: Date.UTC(2026, 10, 19),
    })

    const entries = injected.hooks.history.getSnapshot().entries
    expect(entries.map(entry => entry.text)).toEqual(['first input', 'second input'])
    expect(entries[0]?.projectKey).toBe('/work/project')
    const persisted = JSON.parse(localStorage.getItem(INPUT_HISTORY_STORAGE_KEY) ?? '{}') as {
      entries: { text: string }[]
    }
    expect(persisted.entries.map(entry => entry.text)).toEqual(['first input', 'second input'])
    await ctx.fiber.dispose()
  })

  it('writes recall preferences through the injected face', async () => {
    const { ctx, injected } = await bench()

    injected.setScope('global')
    injected.setRetentionDays(7)
    injected.setEnabled(false)

    expect(injected.hooks.history.getSnapshot().settings).toEqual({
      enabled: false,
      scope: 'global',
      retentionDays: 7,
    })
    const persisted = createInputHistoryStore({ storage: localStorage, now: () => Date.now() })
    expect(persisted.state.getSnapshot().settings).toMatchObject({ enabled: false, scope: 'global', retentionDays: 7 })
    await ctx.fiber.dispose()
  })

  it('clears cached entries without touching the preferences', async () => {
    const { ctx, injected } = await bench()
    ctx.emit('conversation/input-accepted', { sessionId: sid('s1'), text: 'cached', submittedAt: 1 })
    injected.setScope('project')

    injected.clear()

    expect(injected.hooks.history.getSnapshot().entries).toEqual([])
    expect(injected.hooks.history.getSnapshot().settings.scope).toBe('project')
    await ctx.fiber.dispose()
  })

  it('sweeps entries past retention on the hourly timer', async () => {
    vi.useFakeTimers()
    const day = 86_400_000
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 19)))
    try {
      const { ctx, injected } = await bench()
      ctx.emit('conversation/input-accepted', {
        sessionId: sid('s1'),
        text: 'about to expire',
        submittedAt: Date.now() - 29 * day,
      })
      expect(injected.hooks.history.getSnapshot().entries).toHaveLength(1)

      vi.setSystemTime(new Date(Date.UTC(2026, 10, 19) + 2 * day))
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(injected.hooks.history.getSnapshot().entries).toEqual([])
      await ctx.fiber.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('registers one fixed-input observer and removes every contribution on teardown', async () => {
    const { ctx, plugin, injected, slots, shortcuts } = await bench()
    expect(shortcuts.listeners.size).toBe(1)

    // The observer's closure is the wiring under test: it forwards the key to
    // the controller, which ignores a reset without touching the ledger.
    const [listener] = [...shortcuts.listeners]
    listener?.({ type: 'reset' })

    ctx.emit('conversation/input-accepted', { sessionId: sid('s1'), text: 'before teardown', submittedAt: 1 })
    expect(injected.hooks.history.getSnapshot().entries).toHaveLength(1)

    await plugin.dispose()

    expect(shortcuts.listeners.size).toBe(0)
    expect(shortcuts.disposers[0]).toHaveBeenCalledOnce()
    expect(slots.entries('settings.section').some(candidate => candidate.options.id === 'input-history')).toBe(false)
    // The accepted-input listener left with the fiber: a later message cannot
    // reach the disposed controller.
    ctx.emit('conversation/input-accepted', { sessionId: sid('s1'), text: 'after teardown', submittedAt: 2 })
    expect(injected.hooks.history.getSnapshot().entries.map(entry => entry.text)).toEqual(['before teardown'])
    await ctx.fiber.dispose()
  })
})
