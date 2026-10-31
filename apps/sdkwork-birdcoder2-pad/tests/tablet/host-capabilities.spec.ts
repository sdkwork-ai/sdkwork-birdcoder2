import { describe, expect, it } from 'vitest'

import {
  TABLET_HOST_CAPABILITIES,
  TABLET_HOST_PLATFORM_TARGETS,
} from '../../packages/sdkwork-birdcoder2-pad-tauri/src/host/capabilities'
import { createTabletHostAdapter } from '../../packages/sdkwork-birdcoder2-pad-tauri/src/host/tablet-host-adapter'

describe('tablet host adapter fallbacks', () => {
  it.each(TABLET_HOST_PLATFORM_TARGETS)('creates a typed adapter for %s', (target) => {
    const adapter = createTabletHostAdapter(target)
    expect(adapter.platform).toBe(target === 'tablet-android' ? 'android-tablet' : 'ipados')
    expect(adapter.supports('secureStorage')).toBe(true)
  })

  it('returns unsupported for undeclared capabilities instead of throwing', async () => {
    const adapter = createTabletHostAdapter('tablet-android')
    await expect(adapter.invoke('stylus', 'beginStroke')).resolves.toMatchObject({
      status: 'unsupported',
      capability: 'stylus',
    })
  })

  it('returns unavailable when a declared native bridge is not attached', async () => {
    const adapter = createTabletHostAdapter('tablet-ipados')
    await expect(adapter.invoke('filePicker', 'open')).resolves.toMatchObject({
      status: 'unavailable',
      capability: 'filePicker',
    })
  })

  it('keeps secure storage inside the host boundary', async () => {
    const adapter = createTabletHostAdapter('tablet-ipados')
    await expect(adapter.secureStorage.setItem('access-token', 'value')).resolves.toMatchObject({
      status: 'unavailable',
      capability: 'secureStorage',
    })
  })

  it('declares no stylus capability when the product does not claim it', () => {
    expect(TABLET_HOST_CAPABILITIES).not.toContain('stylus')
    expect(TABLET_HOST_CAPABILITIES).toContain('secureStorage')
  })
})
