import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WINDOW_ICON_RELATIVE_PATH, resolveWindowIcon } from '../src/app-icon.ts'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUILD_DIR = join(APP_ROOT, 'build')
const CANONICAL_RASTER = fileURLToPath(new URL('../../web/public/favicon.png', import.meta.url))

/** Complete macOS release environment, so the packaging config resolves for a named target. */
const RELEASE_ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.desktop',
  DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
  DSH_DESKTOP_TARGET_ARCH: 'arm64',
  DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
  DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
  APPLE_API_KEY: '/private/credentials/AuthKey_TEST123456.p8',
  APPLE_API_KEY_ID: 'TEST123456',
  APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555',
  DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
}

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('desktop app icon', () => {
  it('resolves the shipped window raster for the platforms that draw one', () => {
    expect(resolveWindowIcon(APP_ROOT, 'win32')).toBe(join(APP_ROOT, WINDOW_ICON_RELATIVE_PATH))
    expect(resolveWindowIcon(APP_ROOT, 'linux')).toBe(join(APP_ROOT, WINDOW_ICON_RELATIVE_PATH))
    expect(resolveWindowIcon(APP_ROOT, 'darwin')).toBeUndefined()
    expect(resolveWindowIcon(join(tmpdir(), 'dsh-missing-app'), 'win32')).toBeUndefined()
  })

  it('ships a square PNG window raster generated from the canonical product mark', () => {
    const canonical = readFileSync(CANONICAL_RASTER)
    expect(canonical.subarray(1, 4).toString('latin1')).toBe('PNG')
    const windowIcon = readFileSync(join(BUILD_DIR, 'icon.png'))
    expect(windowIcon.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect(pngSize(windowIcon)).toEqual({ width: 512, height: 512 })
  })

  it('ships a Windows ICO carrying a 256 pixel entry', () => {
    const ico = readFileSync(join(BUILD_DIR, 'icon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    const sizes = Array.from({ length: count }, (_unused, index) => ico.readUInt8(6 + index * 16) || 256)
    expect(sizes).toContain(16)
    expect(sizes).toContain(256)
  })

  it('ships a macOS ICNS with 512 and 1024 pixel chunks', () => {
    const icns = readFileSync(join(BUILD_DIR, 'icon.icns'))
    expect(icns.subarray(0, 4).toString('latin1')).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    expect(icns.includes(Buffer.from('ic09', 'latin1'))).toBe(true)
    expect(icns.includes(Buffer.from('ic10', 'latin1'))).toBe(true)
  })
})

describe('desktop packaging icon wiring', () => {
  beforeAll(() => {
    for (const [name, value] of Object.entries(RELEASE_ENVIRONMENT)) vi.stubEnv(name, value)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('names the BirdCoder rasters for every packaged platform instead of relying on defaults', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig(RELEASE_ENVIRONMENT, 'darwin', 'arm64')
    expect(config.directories.buildResources).toBe('build')
    expect(config.mac).toMatchObject({ icon: 'build/icon.icns' })
    expect(config.win).toMatchObject({ icon: 'build/icon.ico' })
    expect(config.linux).toMatchObject({ icon: 'build/icon.png' })
    expect(config.nsis).toMatchObject({
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
      installerHeaderIcon: 'build/icon.ico',
    })
    expect(config.files).toContain(WINDOW_ICON_RELATIVE_PATH.split(sep).join('/'))
  })
})
