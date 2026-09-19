import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Arch, Platform } from 'electron-builder'
import { Packager } from 'app-builder-lib'
import { describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn(async () => undefined) }))
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...original, execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) }
})

describe('installer preparation preserves application dependencies', () => {
  it.each(['win32', 'darwin'] as const)('rejects a missing production policy before signing on %s', async (platform) => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    expect(() => createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://harness-test.deepseek.com',
    }, platform, 'x64')).toThrow('DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN')
  })
  it.each(['win32', 'darwin'] as const)('keeps electron-builder responsible for node_modules on %s', async (platform) => {
    execute.mockClear()
    const env = {
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_TARGET_PLATFORM: platform,
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: platform === 'win32' ? '1' : '0',
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
      APPLE_KEYCHAIN_PROFILE: 'installer-test',
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
    }
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
      const config = createElectronBuilderConfig(env, platform, 'x64')
      const aboutIcon = config.extraResources.find(resource => resource.to === 'icon.png')
      expect(aboutIcon).toBeDefined()
      expect(readFileSync(aboutIcon!.from)).toEqual(readFileSync(new URL('../resources/icon-windows.png', import.meta.url)))
      const packager = new Packager({ projectDir: tmpdir() })
      // A foreign source-build target avoids rebuilding modules; the real dependency ownership decision still runs.
      Object.defineProperties(packager, {
        config: { value: { beforeBuild: config.beforeBuild, buildDependenciesFromSource: true } },
        framework: { value: { isNpmRebuildRequired: true, version: '42.0.0' } },
        appInfo: { value: { type: 'module' } },
      })
      vi.spyOn(packager, 'getWorkspaceRoot').mockResolvedValue(tmpdir())
      await packager.installAppDependencies(process.platform === 'win32' ? Platform.LINUX : Platform.WINDOWS, Arch.x64)
      expect(packager.areNodeModulesHandledExternally).toBe(false)
      expect(execute).toHaveBeenCalledTimes(platform === 'win32' ? 1 : 0)
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })
})

// `installer.nsh` declares `!define /ifndef INSTALLER_BUILD_DIR` with a
// `targets\win-x64` fallback resolved from `${__FILEDIR__}`, while `beforeBuild`
// compiles the native helper into the *per-target* `installer-ui`. Every Windows
// target therefore read the x64 directory: correct on win-x64 by coincidence, and
// fatal on win-arm64, where NSIS aborted with
// `...\targets\win-x64\installer-ui\window-frame.dll -> no files found`.
// The config now binds the resolved target directory through the include, so this
// guard fails if that binding is ever dropped again.
describe('installer include binds the per-target build directory', () => {
  it.each([
    ['win-arm64', 'arm64'],
    ['win-x64', 'x64'],
  ] as const)('hands NSIS the %s installer-ui directory, not the win-x64 fallback', async (target, arch) => {
    const env = {
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: arch,
      DSH_DESKTOP_UNSIGNED: '1',
    }
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
      const config = createElectronBuilderConfig(env, 'win32', 'x64')
      const include = config.nsis.include as string

      // The include must be a generated wrapper (never the repo script, whose
      // fallback hardcodes win-x64) and must live beside this target's assets —
      // the same `installer-ui` directory `beforeBuild` compiles the helper into.
      expect(include).not.toEqual(fileURLToPath(new URL('../scripts/installer.nsh', import.meta.url)))
      const installerUi = dirname(include)
      expect(installerUi).toContain(join('targets', target, 'installer-ui'))

      // The wrapper must define INSTALLER_BUILD_DIR as exactly this target's
      // installer-ui directory, then include the repo script unchanged.
      const wrapper = readFileSync(include, 'utf8')
      expect(wrapper).toContain(`!define INSTALLER_BUILD_DIR "${installerUi}"`)
      expect(wrapper).toContain(`!include "${fileURLToPath(new URL('../scripts/installer.nsh', import.meta.url))}"`)
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })

  it('leaves non-Windows targets on the repo include', async () => {
    const env = {
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_TARGET_PLATFORM: 'linux',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: '1',
    }
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
      const config = createElectronBuilderConfig(env, 'linux', 'x64')
      expect(config.nsis.include).toEqual(fileURLToPath(new URL('../scripts/installer.nsh', import.meta.url)))
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })
})
