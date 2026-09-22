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

      // upstream-owned installer/path.nsh:160 reads ${APP_64_UNPACKED_SIZE}
      // without a guard, but electron-builder only defines the arch-suffixed
      // variant it built. An arm64 build receives APP_ARM64_UNPACKED_SIZE alone,
      // so NSIS warns 6000 and `-WX` turns that into a failed makensis run. The
      // wrapper must alias the built variant before the repo script is read.
      expect(wrapper).toContain('!ifndef APP_64_UNPACKED_SIZE')
      expect(wrapper).toContain('!define APP_64_UNPACKED_SIZE ${APP_ARM64_UNPACKED_SIZE}')
      expect(wrapper.indexOf('!ifndef APP_64_UNPACKED_SIZE'))
        .toBeLessThan(wrapper.indexOf(`!include "${fileURLToPath(new URL('../scripts/installer.nsh', import.meta.url))}"`))
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

// FORK DIVERGENCE (AGENTS.md, "Windows installer install mode"): upstream locks
// the Windows installer to the current user — it refuses `/allusers` and any
// machine-wide registration, and it cannot even compile once the build is
// machine-wide, because `setInstallModePerUser` is only defined for per-user
// builds. The fork installs for all users instead. That behavior lives in
// upstream-owned NSIS files which every upstream merge re-resolves, so these
// guards fail if a merge brings the lock back or drops the machine-wide
// ownership check that makes an existing all-users installation upgradable.
describe('Windows installer installs for all users', () => {
  const windowsEnv = {
    DSH_DESKTOP_APP_ID: 'com.example.installer',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_TARGET_PLATFORM: 'win32',
    DSH_DESKTOP_TARGET_ARCH: 'x64',
    DSH_DESKTOP_UNSIGNED: '1',
  }
  // The divergence comments name the upstream symbols they removed, so the
  // guards run against code with NSIS comments stripped.
  const nsisCode = (source: string): string => source
    .split('\n').map(line => line.replace(/;.*$/u, '')).join('\n')

  it('defaults to a machine-wide installer and leaves it only on request', async () => {
    for (const [name, value] of Object.entries(windowsEnv)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
      expect(createElectronBuilderConfig(windowsEnv, 'win32', 'x64').nsis.perMachine).toBe(true)
      expect(createElectronBuilderConfig({ ...windowsEnv, DSH_DESKTOP_INSTALL_MODE: 'perUser' }, 'win32', 'x64')
        .nsis.perMachine).toBe(false)
      expect(() => createElectronBuilderConfig({ ...windowsEnv, DSH_DESKTOP_INSTALL_MODE: 'both' }, 'win32', 'x64'))
        .toThrow('DSH_DESKTOP_INSTALL_MODE must be perMachine or perUser')
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })

  it('keeps the per-user lock out of the installer script', () => {
    const script = nsisCode(readFileSync(new URL('../scripts/installer.nsh', import.meta.url), 'utf8'))
    // `setInstallModePerUser` is undefined in a `perMachine` build: leaving the
    // call in place fails makensis rather than shipping a per-user installer.
    expect(script).not.toContain('setInstallModePerUser')
    expect(script).not.toContain('isForAllUsers')
    expect(script).not.toContain('INSTALLER_PER_USER')
    // The machine-wide build compiles no install-mode page at all, so nothing may
    // re-force the per-user mode from the page callback that used to host it.
    expect(script).not.toContain('$installMode CurrentUser')
  })

  it('accepts a machine-wide registration as the owner of its directory', () => {
    const path = nsisCode(readFileSync(new URL('../installer/path.nsh', import.meta.url), 'utf8'))
    const preflight = path.slice(path.indexOf('Function InstallerPreflight'))
    expect(preflight).toContain('ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"')
    // The per-user registration stays the first source, the machine-wide one is
    // the fallback, and both precede the emptiness test that rejects a directory
    // owned by neither.
    expect(preflight.indexOf('ReadRegStr $0 HKCU')).toBeLessThan(preflight.indexOf('ReadRegStr $0 HKLM'))
    expect(preflight.indexOf('ReadRegStr $0 HKLM')).toBeLessThan(preflight.indexOf('INSTALLER_PATH_OWNERSHIP'))
  })

  it('drops the per-user rejection copy from the installer strings', () => {
    const strings = nsisCode(readFileSync(new URL('../installer/strings.nsh', import.meta.url), 'utf8'))
    expect(strings).not.toContain('INSTALLER_PER_USER')
    // The installer now always runs elevated, so no copy may promise otherwise.
    expect(strings).not.toContain('does not request administrator rights')
    expect(strings).not.toContain('不会申请管理员权限')
  })
})
