import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  TABLET_HOST_CAPABILITIES,
  TABLET_HOST_PLATFORM_TARGETS,
} from '../src/host/capabilities'
import { createTabletHostAdapter } from '../src/host/tablet-host-adapter'

const specPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../specs/tablet-adaptation.spec.json',
)
const adaptationSpec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as {
  capabilities: string[]
  input: { stylus: boolean }
}

describe('tablet host capabilities', () => {
  it('declares exactly the capabilities in the tablet adaptation contract', () => {
    expect([...TABLET_HOST_CAPABILITIES].sort()).toEqual([...adaptationSpec.capabilities].sort())
  })

  it('declares secure storage for token persistence', () => {
    expect(TABLET_HOST_CAPABILITIES).toContain('secureStorage')
  })

  it('does not claim stylus when the contract does not', () => {
    expect(adaptationSpec.input.stylus).toBe(false)
    expect(TABLET_HOST_CAPABILITIES).not.toContain('stylus')
  })

  it.each(TABLET_HOST_PLATFORM_TARGETS)('maps %s to a typed host adapter', (target) => {
    const adapter = createTabletHostAdapter(target)
    expect(adapter.platform).toBe(target === 'tablet-android' ? 'android-tablet' : 'ipados')
    expect(adapter.capabilities.size).toBe(TABLET_HOST_CAPABILITIES.length)
  })

  it('returns unsupported for a capability the host does not declare', async () => {
    const adapter = createTabletHostAdapter('tablet-ipados')
    await expect(adapter.invoke('stylus', 'beginStroke')).resolves.toMatchObject({
      status: 'unsupported',
      capability: 'stylus',
    })
  })

  it('returns unavailable instead of throwing when the native bridge is absent', async () => {
    const adapter = createTabletHostAdapter('tablet-ipados')
    await expect(adapter.secureStorage.getItem('access-token')).resolves.toMatchObject({
      status: 'unavailable',
      capability: 'secureStorage',
    })
  })
})
