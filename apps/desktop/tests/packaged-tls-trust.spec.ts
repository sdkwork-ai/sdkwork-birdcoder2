import { describe, expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { resolveDesktopInsecureTls } from '../scripts/desktop-release-environment.mjs'

const ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.desktop',
  DSH_DESKTOP_TARGET_PLATFORM: 'linux',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '1',
}

describe('packaged self-signed HTTPS trust', () => {
  it('embeds no trust default while verification stays on', () => {
    const config = createElectronBuilderConfig(ENVIRONMENT, 'linux', 'x64')
    expect(config.extraMetadata).not.toHaveProperty('dshDesktopInsecureTls')
  })

  it('embeds the trust opt-in the installed application reads', () => {
    const config = createElectronBuilderConfig({ ...ENVIRONMENT, DSH_DESKTOP_INSECURE_TLS: '1' }, 'linux', 'x64')
    expect(config.extraMetadata).toMatchObject({ dshDesktopAppId: 'com.example.desktop', dshDesktopInsecureTls: true })
  })

  it('treats an empty value as verification on and rejects other values', () => {
    expect(resolveDesktopInsecureTls({})).toBe(false)
    expect(resolveDesktopInsecureTls({ DSH_DESKTOP_INSECURE_TLS: '' })).toBe(false)
    expect(resolveDesktopInsecureTls({ DSH_DESKTOP_INSECURE_TLS: '0' })).toBe(false)
    expect(resolveDesktopInsecureTls({ DSH_DESKTOP_INSECURE_TLS: '1' })).toBe(true)
    for (const value of ['true', 'yes', '2']) {
      expect(() => resolveDesktopInsecureTls({ DSH_DESKTOP_INSECURE_TLS: value })).toThrow('must be 0 or 1')
    }
  })
})
