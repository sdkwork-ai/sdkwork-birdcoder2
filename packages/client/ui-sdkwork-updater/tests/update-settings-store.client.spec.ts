/**
 * Update settings row store: the revision-guarded settings mirror plus the
 * unconditional bridge-state mirror for the status line.
 */

import { describe, expect, it } from 'vitest'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import { createUpdateSettingsRowStore } from '../src/client/update-settings-store.ts'

const SYNC = {
  autoCheckUpdates: true,
  updateChannel: 'follow' as const,
  autoDownload: false,
  writable: true,
  revision: 1,
}

describe('createUpdateSettingsRowStore', () => {
  it('mirrors a settings snapshot and guards on the revision', () => {
    const handle = createUpdateSettingsRowStore()
    const instance = handle.create()
    instance.actions.syncSettings(SYNC)
    expect(instance.getSnapshot()).toMatchObject(SYNC)
    // A stale duplicate (same revision) is dropped.
    instance.actions.syncSettings({ ...SYNC, autoCheckUpdates: false })
    expect(instance.getSnapshot().autoCheckUpdates).toBe(true)
    instance.actions.syncSettings({ ...SYNC, autoCheckUpdates: false, revision: 2 })
    expect(instance.getSnapshot().autoCheckUpdates).toBe(false)
  })

  it('treats an absent revision as a no-op (the fallback keeps the guard intact)', () => {
    const handle = createUpdateSettingsRowStore()
    const instance = handle.create()
    instance.actions.syncSettings({ ...SYNC, revision: undefined })
    expect(instance.getSnapshot()).toMatchObject({
      autoCheckUpdates: undefined, updateChannel: undefined, autoDownload: undefined,
    })
  })

  it('mirrors the bridge update slice unconditionally (the bridge owns the sequence)', () => {
    const handle = createUpdateSettingsRowStore()
    const instance = handle.create()
    instance.actions.syncSettings(SYNC)
    const state: DesktopUpdateState = {
      phase: 'available',
      canInstall: true,
      version: '0.1.0-rc.10',
      error: 'signature mismatch',
    }
    instance.actions.syncUpdate(state)
    expect(instance.getSnapshot()).toMatchObject({
      phase: 'available',
      version: '0.1.0-rc.10',
      error: 'signature mismatch',
      autoCheckUpdates: true,
    })
    instance.actions.syncUpdate({ phase: 'idle', canInstall: true })
    expect(instance.getSnapshot()).toMatchObject({ phase: 'idle', version: undefined, error: undefined })
  })
})
