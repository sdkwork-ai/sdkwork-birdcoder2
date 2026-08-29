/**
 * ui-sdkwork-window-controls plugin halves: the browser entry registers the overlay
 * cluster and header spacer against the real SlotRegistry (with fiber teardown
 * proving removal — HMR safety), routes tray-driven navigation into the
 * sessions/workspaces services, owns the close-to-tray settings row, the inert
 * node entry, and the invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { DesktopBridge, DesktopStreamHandle, DesktopWindowControls, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as WindowControlsInvariant from '../src/invariant.ts'
import { TraySettingsRow } from '../src/client/TraySettingsRow.tsx'
import { createTraySettingsRowStore } from '../src/client/tray-settings-store.ts'

/** The slots this plugin registers into. */
type WindowSlot = 'conversation.session.header.utilities' | 'shell.overlay'

/** Entry ids currently registered in one target slot. */
function entryIds(ctx: Context, slot: WindowSlot): (string | undefined)[] {
  return ctx.slots.entries(slot).map(entry => entry.options.id)
}

/** A controllable settings scope mirroring the host `desktop` namespace. */
function fakeSettingsScope() {
  let snapshot: {
    status: 'loading' | 'ready' | 'unavailable'
    value: { closeToTray: boolean }
    base: undefined
    user: undefined
    revision: number
    writable: boolean
    mode: 'host'
  } = {
    status: 'ready',
    value: { closeToTray: true },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const subscribers = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    if (field !== 'closeToTray') return
    snapshot = { ...snapshot, value: { closeToTray: value as boolean }, revision: snapshot.revision + 1 }
    for (const listener of [...subscribers]) listener()
  })
  return {
    bind: vi.fn(() => ({
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        subscribers.add(listener)
        return () => { subscribers.delete(listener) }
      },
      set,
      unset: vi.fn(async () => {}),
    })),
    set,
    setHostValue: (closeToTray: boolean) => {
      snapshot = { ...snapshot, value: { closeToTray }, revision: snapshot.revision + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostStatus: (status: 'loading' | 'ready' | 'unavailable') => {
      snapshot = { ...snapshot, status, revision: snapshot.revision + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostWritable: (writable: boolean) => {
      snapshot = { ...snapshot, writable, revision: snapshot.revision + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostRevision: (revision: number | undefined) => {
      snapshot = { ...snapshot, revision: revision ?? -1 }
      for (const listener of [...subscribers]) listener()
    },
  }
}

/** Boot the browser half over a real slot tree that declares the target slots. */
async function bench(ids: SessionId[] = []) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'settings.general.item': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const sessions = {
    list: { getSnapshot: () => ({ ids }) },
    refresh: vi.fn(async () => {}),
    open: vi.fn(),
  }
  const workspaces = { startSession: vi.fn() }
  const settingsScope = fakeSettingsScope()
  ctx.provide('sessions', sessions as never)
  ctx.provide('workspaces', workspaces as never)
  ctx.provide('settingsScope', settingsScope as never)
  return { ctx, sessions, workspaces, settingsScope }
}

/** A controllable preload bridge exposing the tray-navigation surface. */
function bridgeWith() {
  const openListeners: ((sessionId: SessionId) => void)[] = []
  const newListeners: (() => void)[] = []
  const detachOpen = vi.fn()
  const detachNew = vi.fn()
  const bridge: DesktopBridge = {
    fetch: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn(),
    openStream: vi.fn((): DesktopStreamHandle => ({ cancel: vi.fn(), onEnd: vi.fn() })),
    version: 'test',
    onOpenSession: vi.fn((listener: (sessionId: SessionId) => void) => {
      openListeners.push(listener)
      return detachOpen
    }),
    onNewSession: vi.fn((listener: () => void) => {
      newListeners.push(listener)
      return detachNew
    }),
  }
  return { bridge, openListeners, newListeners, detachOpen, detachNew }
}

/** Apply the plugin once (with the current globalThis.desktopBridge in effect). */
async function mount(b: ReturnType<typeof bench> extends Promise<infer T> ? T : never) {
  const fiber = b.ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return fiber
}

describe('ui-sdkwork-window-controls browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'settingsScope'])
  })

  it('registers both clusters, and fiber teardown removes them (HMR safety)', async () => {
    const b = await bench()
    const fiber = await mount(b)
    expect(entryIds(b.ctx, 'conversation.session.header.utilities')).toContain('window-controls')
    expect(entryIds(b.ctx, 'shell.overlay')).toContain('window-controls-floating')
    await fiber.dispose()
    expect(entryIds(b.ctx, 'conversation.session.header.utilities')).not.toContain('window-controls')
    expect(entryIds(b.ctx, 'shell.overlay')).not.toContain('window-controls-floating')
  })

  it('injects the preload surface when the bridge exposes it', async () => {
    const surface = { minimize: vi.fn() } as unknown as DesktopWindowControls
    ;(globalThis as { desktopBridge?: unknown }).desktopBridge = { windowControls: surface }
    try {
      const b = await bench()
      const fiber = await mount(b)
      const entry = b.ctx.slots.entries('shell.overlay')[0]
      const injected = entry?.inject?.()
      expect((injected as { windowControls?: unknown } | undefined)?.windowControls).toBe(surface)
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: unknown }).desktopBridge
    }
  })

  it('opens a listed session directly on a tray command', async () => {
    const b = await bench(['s1' as SessionId])
    const { bridge, openListeners } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      openListeners[0]?.('s1' as SessionId)
      await Promise.resolve()
      expect(b.sessions.refresh).not.toHaveBeenCalled()
      expect(b.sessions.open).toHaveBeenCalledWith('s1')
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('repulls the baseline before opening an unknown session, tolerating refresh failure', async () => {
    const b = await bench([])
    b.sessions.refresh.mockRejectedValueOnce(new Error('wire down'))
    const { bridge, openListeners } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      openListeners[0]?.('s9' as SessionId)
      await vi.waitFor(() => {
        expect(b.sessions.refresh).toHaveBeenCalledTimes(1)
      })
      // The refresh failure is non-fatal: the open attempt still runs.
      expect(b.sessions.open).toHaveBeenCalledWith('s9')
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('starts a fresh session on a tray new-session command', async () => {
    const b = await bench()
    const { bridge, newListeners } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      newListeners[0]?.()
      expect(b.workspaces.startSession).toHaveBeenCalledTimes(1)
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('detaches tray listeners on fiber teardown', async () => {
    const b = await bench()
    const { bridge, detachOpen, detachNew } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      await fiber.dispose()
      expect(detachOpen).toHaveBeenCalledTimes(1)
      expect(detachNew).toHaveBeenCalledTimes(1)
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('registers the close-to-tray row and routes writes back through the scope', async () => {
    const b = await bench()
    const fiber = await mount(b)
    const entry = b.ctx.slots.entries('settings.general.item')
      .find(e => e.component === TraySettingsRow)
    expect(entry?.options).toMatchObject({ id: 'desktop-tray', order: 20 })

    const handle = entry?.store as ReturnType<typeof createTraySettingsRowStore>
    const instance = handle?.create()
    const face = (entry?.inject as unknown as (a: typeof instance.actions) => { setCloseToTray: (v: boolean) => void })
      ?.(instance.actions)
    // The inject-time re-sync mirrors the current scope value.
    expect(instance?.getSnapshot().enabled).toBe(true)
    expect(instance?.getSnapshot().writable).toBe(true)

    face?.setCloseToTray(false)
    expect(b.settingsScope.set).toHaveBeenCalledWith('closeToTray', false)
    await vi.waitFor(() => {
      expect(instance?.getSnapshot().enabled).toBe(false)
    })
    // A host-side change (e.g. an edited settings.yaml) mirrors back.
    b.settingsScope.setHostValue(true)
    await vi.waitFor(() => {
      expect(instance?.getSnapshot().enabled).toBe(true)
    })
    // A scope that stops exposing the namespace blanks the mirror (the row
    // then renders nothing) instead of trusting a stale value.
    b.settingsScope.setHostStatus('unavailable')
    await vi.waitFor(() => {
      expect(instance?.getSnapshot()).toMatchObject({ enabled: undefined, writable: false })
    })
    // A ready-but-read-only document keeps the value but disables the row.
    b.settingsScope.setHostStatus('ready')
    b.settingsScope.setHostWritable(false)
    await vi.waitFor(() => {
      expect(instance?.getSnapshot()).toMatchObject({ enabled: true, writable: false })
    })
    // A scope that has not accepted a section yet carries no revision; the
    // mirror's fallback keeps the revision guard intact (the write is a no-op).
    const previousRevision = instance?.getSnapshot().revision
    b.settingsScope.setHostRevision(undefined)
    await vi.waitFor(() => {
      expect(instance?.getSnapshot().revision).toBe(previousRevision)
    })
    await fiber.dispose()
  })

  it('leaves the settings row unregistered without a declaration and tears down quietly', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)
    const sessions = { list: { getSnapshot: () => ({ ids: [] as SessionId[] }) }, refresh: vi.fn(async () => {}), open: vi.fn() }
    ctx.provide('sessions', sessions as never)
    ctx.provide('workspaces', { startSession: vi.fn() } as never)
    ctx.provide('settingsScope', fakeSettingsScope() as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('settings.general.item')).toHaveLength(0)
    await fiber.dispose()
  })

  it('tolerates an open command for a session that never lands in the mirror', async () => {
    const b = await bench([])
    b.sessions.open.mockImplementation(() => {
      throw new Error('sessions.select: unknown session s9')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { bridge, openListeners } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      openListeners[0]?.('s9' as SessionId)
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('tray session s9 unavailable:'),
          expect.any(Error),
        )
      })
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
      warn.mockRestore()
    }
  })

  it('tears down quietly when the preload exposes no bridge', async () => {
    const b = await bench()
    const fiber = await mount(b)
    await fiber.dispose()
  })
})

describe('ui-sdkwork-window-controls node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })
})

describe('ui-sdkwork-window-controls invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(WindowControlsInvariant)
    await fiber.await()
    expect(WindowControlsInvariant.name).toBe('client-ui-sdkwork-window-controls-invariant')
    expect(WindowControlsInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
