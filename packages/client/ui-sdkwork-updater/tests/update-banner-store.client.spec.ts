/**
 * Update banner store: bridge-state mirroring and the same-version dismissal
 * flag.
 */

import { describe, expect, it } from 'vitest'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import { createUpdateBannerStore } from '../src/client/update-banner-store.ts'

const AVAILABLE: DesktopUpdateState = {
  phase: 'available',
  canInstall: true,
  version: '0.1.0-rc.10',
  releaseName: 'dsh 0.1.0-rc.10',
  releaseNotes: '- fixes',
}

describe('createUpdateBannerStore', () => {
  it('starts idle and mirrors a pushed state', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    expect(instance.getSnapshot()).toMatchObject({ phase: 'idle', canInstall: false })
    instance.actions.sync(AVAILABLE)
    expect(instance.getSnapshot()).toMatchObject({
      phase: 'available',
      version: '0.1.0-rc.10',
      releaseName: 'dsh 0.1.0-rc.10',
      releaseNotes: '- fixes',
    })
  })

  it('mirrors download progress percent and clears it on completion', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    instance.actions.sync({ ...AVAILABLE, phase: 'downloading', progress: { percent: 42, transferred: 1, total: 2, bytesPerSecond: 3 } })
    expect(instance.getSnapshot().progressPercent).toBe(42)
    instance.actions.sync({ ...AVAILABLE, phase: 'downloaded' })
    expect(instance.getSnapshot().progressPercent).toBeUndefined()
  })

  it('retains the dismissed offer version across same-version state pushes', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    instance.actions.sync(AVAILABLE)
    instance.actions.dismiss()
    expect(instance.getSnapshot().dismissedVersion).toBe('0.1.0-rc.10')
    instance.actions.sync({ ...AVAILABLE, phase: 'downloading', progress: { percent: 10, transferred: 1, total: 2, bytesPerSecond: 3 } })
    expect(instance.getSnapshot().dismissedVersion).toBe('0.1.0-rc.10')
  })

  it('re-shows the banner when a different version is offered', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    instance.actions.sync(AVAILABLE)
    instance.actions.dismiss()
    instance.actions.sync({ ...AVAILABLE, version: '0.1.0-rc.11' })
    expect(instance.getSnapshot().dismissedVersion).toBeUndefined()
    expect(instance.getSnapshot().version).toBe('0.1.0-rc.11')
  })

  it('keeps the error mirroring a failure', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    instance.actions.sync({ ...AVAILABLE, error: 'signature mismatch' })
    expect(instance.getSnapshot().error).toBe('signature mismatch')
  })

  it('clears the version when a versionless state arrives and dismisses nothing without an offer', () => {
    const handle = createUpdateBannerStore()
    const instance = handle.create()
    instance.actions.sync({ phase: 'idle', canInstall: false })
    expect(instance.getSnapshot().version).toBeUndefined()
    instance.actions.dismiss()
    expect(instance.getSnapshot().dismissedVersion).toBeUndefined()
  })
})
