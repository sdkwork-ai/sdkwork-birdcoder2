/**
 * ui-sdkwork-updater plugin halves: the browser entry registers the update banner and
 * the preferences row against the real SlotRegistry (with fiber teardown
 * proving removal — HMR safety), mirrors the bridge-pushed update state into
 * both slot stores, owns the update settings row, the inert node entry, and
 * the invariant companion's ownership reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { DesktopBridge, DesktopStreamHandle, DesktopUpdates, DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as UpdaterInvariant from '../src/invariant.ts'
import { UpdateBanner } from '../src/client/UpdateBanner.tsx'
import { UpdateSettingsRow } from '../src/client/UpdateSettingsRow.tsx'
import { createUpdateBannerStore } from '../src/client/update-banner-store.ts'
import { createUpdateSettingsRowStore } from '../src/client/update-settings-store.ts'

/** The slots this plugin registers into. */
type UpdateSlot = 'shell.overlay' | 'settings.general.item'

/** Entry ids currently registered in one target slot. */
function entryIds(ctx: Context, slot: UpdateSlot): (string | undefined)[] {
  return ctx.slots.entries(slot).map(entry => entry.options.id)
}

/** The resolved updater-preference section the fake scope serves. */
type SettingsValue = { autoCheckUpdates: boolean; updateChannel: 'follow' | 'stable' | 'rc'; autoDownload: boolean }

/** A controllable settings scope mirroring the host `desktop` namespace. */
function fakeSettingsScope() {
  let snapshot: {
    status: 'loading' | 'ready' | 'unavailable'
    value: SettingsValue | undefined
    base: undefined
    user: undefined
    revision: number | undefined
    writable: boolean
    mode: 'host'
  } = {
    status: 'ready',
    value: { autoCheckUpdates: true, updateChannel: 'follow', autoDownload: false },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const subscribers = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    if (field !== 'autoCheckUpdates' && field !== 'updateChannel' && field !== 'autoDownload') return
    const next = { ...snapshot.value, [field]: value } as SettingsValue
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? -1) + 1 }
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
    setHostValue: (value: typeof snapshot.value) => {
      snapshot = { ...snapshot, value, revision: (snapshot.revision ?? -1) + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostStatus: (status: 'loading' | 'ready' | 'unavailable') => {
      snapshot = { ...snapshot, status, revision: (snapshot.revision ?? -1) + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostWritable: (writable: boolean) => {
      snapshot = { ...snapshot, writable, revision: (snapshot.revision ?? -1) + 1 }
      for (const listener of [...subscribers]) listener()
    },
    setHostRevision: (revision: number | undefined) => {
      snapshot = { ...snapshot, revision }
      for (const listener of [...subscribers]) listener()
    },
  }
}

/** Boot the browser half over a real slot tree that declares the target slots. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'settings.general.item': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const settingsScope = fakeSettingsScope()
  ctx.provide('settingsScope', settingsScope as never)
  return { ctx, settingsScope }
}

/** A controllable preload bridge exposing the update surface. */
function bridgeWith() {
  const stateListeners: ((state: DesktopUpdateState) => void)[] = []
  const detach = vi.fn()
  const getState = vi.fn(async (): Promise<DesktopUpdateState> => ({ phase: 'idle', canInstall: true }))
  const check = vi.fn()
  const download = vi.fn()
  const install = vi.fn()
  const openReleasePage = vi.fn()
  const updates: DesktopUpdates = {
    getState,
    check,
    download,
    install,
    openReleasePage,
    onState: vi.fn((listener: (state: DesktopUpdateState) => void) => {
      stateListeners.push(listener)
      return detach
    }),
  }
  const bridge: DesktopBridge = {
    fetch: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn(),
    openStream: vi.fn((): DesktopStreamHandle => ({ cancel: vi.fn(), onEnd: vi.fn() })),
    version: 'test',
    onOpenSession: vi.fn(),
    onNewSession: vi.fn(),
    updates,
  }
  return { bridge, updates, stateListeners, detach, getState, check, download, install, openReleasePage }
}

/** Apply the plugin once (with the current globalThis.desktopBridge in effect). */
async function mount(b: Awaited<ReturnType<typeof bench>>) {
  const fiber = b.ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return fiber
}

const AVAILABLE_STATE: DesktopUpdateState = {
  phase: 'available',
  canInstall: true,
  version: '0.1.0-rc.10',
  releaseName: 'dsh 0.1.0-rc.10',
  releaseNotes: '- fixes',
}

describe('ui-sdkwork-updater browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'settingsScope'])
  })

  it('registers the banner and the preferences row, and fiber teardown removes them (HMR safety)', async () => {
    const b = await bench()
    const fiber = await mount(b)
    expect(entryIds(b.ctx, 'shell.overlay')).toContain('update-banner')
    expect(entryIds(b.ctx, 'settings.general.item')).toContain('desktop-update')
    await fiber.dispose()
    expect(entryIds(b.ctx, 'shell.overlay')).not.toContain('update-banner')
    expect(entryIds(b.ctx, 'settings.general.item')).not.toContain('desktop-update')
  })

  it('mirrors the polled and pushed update states into both stores', async () => {
    const b = await bench()
    const { bridge, stateListeners, getState } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      const bannerEntry = b.ctx.slots.entries('shell.overlay')
        .find(e => e.component === UpdateBanner)
      const bannerHandle = bannerEntry?.store as ReturnType<typeof createUpdateBannerStore>
      const bannerInstance = bannerHandle?.create()
      const bannerFace = (bannerEntry?.inject as unknown as (a: typeof bannerInstance.actions) => unknown)?.(bannerInstance?.actions)
      void bannerFace
      const rowEntry = b.ctx.slots.entries('settings.general.item')
        .find(e => e.component === UpdateSettingsRow)
      const rowHandle = rowEntry?.store as ReturnType<typeof createUpdateSettingsRowStore>
      const rowInstance = rowHandle?.create()
      const rowFace = (rowEntry?.inject as unknown as (a: typeof rowInstance.actions) => unknown)?.(rowInstance?.actions)
      void rowFace

      // The poll seeds the stores.
      await vi.waitFor(() => {
        expect(bannerInstance?.getSnapshot().phase).toBe('idle')
      })
      expect(getState).toHaveBeenCalledTimes(1)

      // A pushed transition lands in both stores.
      stateListeners[0]?.(AVAILABLE_STATE)
      expect(bannerInstance?.getSnapshot()).toMatchObject({ phase: 'available', version: '0.1.0-rc.10' })
      expect(rowInstance?.getSnapshot()).toMatchObject({ phase: 'available', version: '0.1.0-rc.10' })
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('contains an initial bridge-state poll failure', async () => {
    const b = await bench()
    const { bridge, getState } = bridgeWith()
    getState.mockRejectedValueOnce(new Error('handler unavailable'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      await vi.waitFor(() => {
        expect(error).toHaveBeenCalledWith(
          'dsh ui-sdkwork-updater: initial state unavailable:',
          expect.objectContaining({ message: 'handler unavailable' }),
        )
      })
      await fiber.dispose()
    } finally {
      error.mockRestore()
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('routes the banner actions to the bridge surface', async () => {
    const b = await bench()
    const { bridge, download, install, openReleasePage } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      const bannerEntry = b.ctx.slots.entries('shell.overlay')
        .find(e => e.component === UpdateBanner)
      const bannerHandle = bannerEntry?.store as ReturnType<typeof createUpdateBannerStore>
      const bannerInstance = bannerHandle?.create()
      const face = (bannerEntry?.inject as unknown as (a: typeof bannerInstance.actions) => {
        download: () => void
        install: () => void
        openReleasePage: () => void
        dismiss: () => void
      })?.(bannerInstance?.actions)
      face?.download()
      face?.install()
      face?.openReleasePage()
      expect(download).toHaveBeenCalledTimes(1)
      expect(install).toHaveBeenCalledTimes(1)
      expect(openReleasePage).toHaveBeenCalledTimes(1)
      // Dismiss is a store action: it flags the current offer version.
      bannerInstance?.actions.sync({ phase: 'available', canInstall: true, version: '0.1.0-rc.10' })
      face?.dismiss()
      expect(bannerInstance?.getSnapshot().dismissedVersion).toBe('0.1.0-rc.10')
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('routes the row writes back through the scope and mirrors host changes', async () => {
    const b = await bench()
    const { bridge, check } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      const rowEntry = b.ctx.slots.entries('settings.general.item')
        .find(e => e.component === UpdateSettingsRow)
      expect(rowEntry?.options).toMatchObject({ id: 'desktop-update', order: 30 })
      const rowHandle = rowEntry?.store as ReturnType<typeof createUpdateSettingsRowStore>
      const rowInstance = rowHandle?.create()
      const face = (rowEntry?.inject as unknown as (a: typeof rowInstance.actions) => {
        setAutoCheck: (value: boolean) => void
        setChannel: (value: 'follow' | 'stable' | 'rc') => void
        setAutoDownload: (value: boolean) => void
        check: () => void
      })?.(rowInstance?.actions)
      // The inject-time re-sync mirrors the current scope value.
      expect(rowInstance?.getSnapshot()).toMatchObject({
        autoCheckUpdates: true, updateChannel: 'follow', autoDownload: false, writable: true,
      })

      face?.setAutoCheck(false)
      expect(b.settingsScope.set).toHaveBeenCalledWith('autoCheckUpdates', false)
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot().autoCheckUpdates).toBe(false)
      })
      face?.setChannel('rc')
      expect(b.settingsScope.set).toHaveBeenCalledWith('updateChannel', 'rc')
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot().updateChannel).toBe('rc')
      })
      face?.setAutoDownload(true)
      expect(b.settingsScope.set).toHaveBeenCalledWith('autoDownload', true)
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot().autoDownload).toBe(true)
      })
      face?.check()
      expect(check).toHaveBeenCalledTimes(1)

      // A host-side change (e.g. an edited settings.yaml) mirrors back.
      b.settingsScope.setHostValue({ autoCheckUpdates: true, updateChannel: 'stable', autoDownload: false })
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot()).toMatchObject({ autoCheckUpdates: true, updateChannel: 'stable' })
      })
      // A scope that stops exposing the namespace blanks the mirror (the row
      // then renders nothing) instead of trusting a stale value.
      b.settingsScope.setHostStatus('unavailable')
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot()).toMatchObject({
          autoCheckUpdates: undefined, updateChannel: undefined, autoDownload: undefined, writable: false,
        })
      })
      // A ready-but-read-only document keeps the value but disables the row.
      b.settingsScope.setHostStatus('ready')
      b.settingsScope.setHostWritable(false)
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot()).toMatchObject({ autoCheckUpdates: true, writable: false })
      })
      // A ready scope that has not accepted a section yet carries no value;
      // the mirror blanks the fields instead of trusting a stale snapshot.
      b.settingsScope.setHostValue(undefined)
      await vi.waitFor(() => {
        expect(rowInstance?.getSnapshot()).toMatchObject({
          autoCheckUpdates: undefined, updateChannel: undefined, autoDownload: undefined,
        })
      })
      await fiber.dispose()
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })

  it('tears down quietly without a bridge or with teardown', async () => {
    const b = await bench()
    const fiber = await mount(b)
    await fiber.dispose()
  })

  it('keeps the settings guard at its initial value when the scope has no revision', async () => {
    const b = await bench()
    b.settingsScope.setHostRevision(undefined)
    const fiber = await mount(b)
    const rowEntry = b.ctx.slots.entries('settings.general.item')
      .find(e => e.component === UpdateSettingsRow)
    const rowHandle = rowEntry?.store as ReturnType<typeof createUpdateSettingsRowStore>
    const rowInstance = rowHandle?.create()
    ;(rowEntry?.inject as unknown as (a: typeof rowInstance.actions) => unknown)?.(rowInstance?.actions)
    expect(rowInstance?.getSnapshot().revision).toBe(-1)
    await fiber.dispose()
  })

  it('detaches the bridge subscription on fiber teardown', async () => {
    const b = await bench()
    const { bridge, detach } = bridgeWith()
    ;(globalThis as { desktopBridge?: DesktopBridge }).desktopBridge = bridge
    try {
      const fiber = await mount(b)
      await fiber.dispose()
      expect(detach).toHaveBeenCalledTimes(1)
    } finally {
      delete (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
    }
  })
})

describe('ui-sdkwork-updater node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })
})

describe('ui-sdkwork-updater invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(UpdaterInvariant)
    await fiber.await()
    expect(UpdaterInvariant.name).toBe('client-ui-sdkwork-updater-invariant')
    expect(UpdaterInvariant.inject).toEqual(['invariants'])
    // Emitting an unrelated event proves the companion installed no audit.
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
