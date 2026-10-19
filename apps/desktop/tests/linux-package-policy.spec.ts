import { describe, expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

const LINUX_ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.desktop',
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  DSH_DESKTOP_TARGET_PLATFORM: 'linux',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '1',
}

describe('desktop Linux release packaging', () => {
  it('embeds no mandatory policy even when policy origins are configured', () => {
    const config = createElectronBuilderConfig(LINUX_ENVIRONMENT, 'linux', 'x64')
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    expect(config.extraMetadata).toMatchObject({ dshDesktopAppId: 'com.example.desktop' })
    expect(config.linux.target).toEqual(['AppImage', 'deb', 'rpm', 'tar.gz'])
  })
})
