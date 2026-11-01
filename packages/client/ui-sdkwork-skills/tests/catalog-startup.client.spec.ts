/**
 * Cold-start catalog wiring: the settings page must fetch the composition-wide
 * catalog on its first render, not only after a session appears or the reader
 * presses reload.
 *
 * The regression this pins is an `undefined === undefined` early return: with no
 * current session, the session follower saw "no change" and never started a
 * read, so the page sat on its idle notice while a bare workspace was open.
 * The check drives the plugin's own apply body with a stub registry and the
 * section's injected face, the way the renderer mounts it.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

/** One captured settings.section registration. */
type Registration = { inject?: (bound: unknown) => unknown }

/**
 * Boot the browser half over stub services and return the registration plus
 * the faces the test drives.
 * @returns the captured registration, the stub remote, and the session store.
 */
async function bench(): Promise<{
  registration: Registration
  list: ReturnType<typeof vi.fn>
  emitSession: (current: string | undefined) => void
  mount: () => { catalogGlobal: ReturnType<typeof vi.fn>; catalogReady: ReturnType<typeof vi.fn> }
}> {
  const ctx = new Context()
  let current: string | undefined
  const listeners = new Set<() => void>()
  const sessions = {
    list: {
      getSnapshot: () => ({ current }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
  }
  const list = vi.fn(async () => ({
    ok: true as const,
    value: {
      skills: [{
        name: 'market-pdf-skill',
        description: 'Installed from SkillHub.',
        modelInvocable: true,
        userInvocable: true,
        source: 'unknown',
        provider: 'skill-market',
      }],
    },
  }))
  const remote = {
    $on: () => () => {},
    skills: { list },
  }
  const scope = {
    getSnapshot: () => ({ status: 'ready' as const, value: { disabledSkills: [], hiddenSceneTags: [], pinnedSceneTags: [] }, writable: true }),
    subscribe: () => () => {},
    set: async () => {},
  }
  let registration: Registration = {}
  ctx.provide('slots' as never, {
    inject: (_name: string, factory: () => unknown) => { factory() },
    register: (options: Registration) => { registration = options; return () => {} },
  } as never)
  ctx.provide('locale' as never, {
    register: () => () => {},
    bind: () => (key: string) => key,
    subscribe: () => () => {},
  } as never)
  ctx.provide('configForms' as never, { get: () => scope } as never)
  ctx.provide('remote' as never, remote as never)
  ctx.provide('sessions' as never, sessions as never)
  apply(ctx)

  const emitSession = (next: string | undefined): void => {
    current = next
    for (const listener of [...listeners]) listener()
  }
  const mount = (): { catalogGlobal: ReturnType<typeof vi.fn>; catalogReady: ReturnType<typeof vi.fn> } => {
    const actions = {
      catalogLoading: vi.fn(),
      catalogReady: vi.fn(),
      catalogGlobal: vi.fn(),
      catalogFailed: vi.fn(),
      preferences: vi.fn(),
      pending: vi.fn(),
    }
    registration.inject?.(actions)
    return actions
  }
  return { registration, list, emitSession, mount }
}

describe('skills catalog cold start', () => {
  it('reads the composition-wide catalog on the first mount with no session', async () => {
    const b = await bench()
    const actions = b.mount()
    await vi.waitFor(() => { expect(actions.catalogGlobal).toHaveBeenCalled() })
    expect(b.list).toHaveBeenCalledWith({ scope: 'all' })
    const rows = actions.catalogGlobal.mock.calls[0]?.[0] as readonly { name: string }[]
    expect(rows.map(row => row.name)).toContain('market-pdf-skill')
  })

  it('reads the session catalog when one is current, and follows a switch', async () => {
    const b = await bench()
    b.emitSession('session-a')
    const actions = b.mount()
    await vi.waitFor(() => { expect(actions.catalogReady).toHaveBeenCalled() })
    expect(b.list).toHaveBeenCalledWith({ sessionId: 'session-a' })
    b.emitSession('session-b')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledWith({ sessionId: 'session-b' }) })
  })
})
