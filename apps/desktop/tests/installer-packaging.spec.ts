import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Arch, Platform } from 'electron-builder'
import { Packager } from 'app-builder-lib'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

/**
 * Read an NSIS source with its `;` comments stripped.
 *
 * The fork's divergence comments deliberately name the upstream symbols they
 * removed (`setInstallModePerUser`, `INSTALLER_PER_USER`, …), so a guard that
 * searched the raw text would trip over its own documentation.
 * @param source - Raw NSIS source.
 * @returns The same source without comment text.
 */
const nsisCode = (source: string): string => source
  .split('\n').map(line => line.replace(/;.*$/u, '')).join('\n')

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
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://test.example.com',
    }, platform, 'x64')).toThrow('DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN')
  })
  it.each(['win32', 'darwin'] as const)('keeps electron-builder responsible for node_modules on %s', async (platform) => {
    execute.mockClear()
    const env = {
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: platform,
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: platform === 'win32' ? '1' : '0',
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
      APPLE_KEYCHAIN_PROFILE: 'installer-test',
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com', DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
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

  it('packages every preload entry point the shell loads', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const sourceDirectory = new URL('../src/', import.meta.url)
    const referenced = new Set<string>()
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      for (const match of readFileSync(new URL(entry.name, sourceDirectory), 'utf8').matchAll(/preload-[a-z-]+\.cjs/gu)) referenced.add(match[0])
    }
    expect(referenced.size).toBeGreaterThan(0)
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://harness-test.deepseek.com',
      DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
      APPLE_KEYCHAIN_PROFILE: 'installer-test',
    }, 'darwin', 'arm64')
    const packaged = new Set(config.files.filter((entry): entry is string => typeof entry === 'string'))
    for (const name of referenced) expect(packaged.has(`lib/${name}`)).toBe(true)
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

describe('Windows installer page sequence', () => {
  const windowsEnv = {
    DSH_DESKTOP_APP_ID: 'com.example.installer',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_TARGET_PLATFORM: 'win32',
    DSH_DESKTOP_TARGET_ARCH: 'x64',
    DSH_DESKTOP_UNSIGNED: '1',
  }

  it('leaves the installation directory to the branded page', async () => {
    for (const [name, value] of Object.entries(windowsEnv)) vi.stubEnv(name, value)
    try {
      const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
      // `true` compiles in the stock `MUI_PAGE_DIRECTORY`, so the flow asked for
      // the same folder twice — once on the branded welcome page, once on an
      // unbranded classic-Win32 page that has no part in the fork's design.
      expect(createElectronBuilderConfig(windowsEnv, 'win32', 'x64')
        .nsis.allowToChangeInstallationDirectory).toBe(false)
    } finally {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })

  it('writes the branded page result into the installer directory', () => {
    const path = nsisCode(readFileSync(new URL('../installer/path.nsh', import.meta.url), 'utf8'))
    // With the stock directory page gone this write-back is the only thing that
    // puts the chosen path into `$INSTDIR`; dropping it makes the branded path row
    // silently decorative.
    expect(path).toContain('StrCpy $INSTDIR $InstallerPath')
  })

  it('keeps the include ready for the no-directory-page shape', () => {
    const script = nsisCode(readFileSync(new URL('../scripts/installer.nsh', import.meta.url), 'utf8'))
    // app-builder-lib defines the inherited INSTFILES pre hook only when the
    // directory page is enabled, so the include supplies its own no-op under the
    // same guard. Without it `InstallerBeforeInstall` calls an undefined label.
    expect(script).toContain('!ifndef allowToChangeInstallationDirectory')
    expect(script).toContain('Function InstallerInheritedPre')
  })
})

// FORK DIVERGENCE (AGENTS.md, "Windows installer brand and path row"): the
// installer draws no brand text of its own — `installer/pages.nsh` blits a single
// bitmap and `prepare-windows-installer.ps1` only flattens the PNGs it is handed —
// so the upstream rasters under `installer/assets/` shipped the upstream whale
// *and* an upstream wordmark baked into the pixels, and every upstream merge put
// them back. The fork regenerates all five rasters from the canonical product mark
// (`pnpm --dir apps/desktop run generate-installer-brand`); these guards fail if a
// merge, or a hand edit, restores the upstream artwork.
describe('Windows installer brand rasters', () => {
  /** Raster, width and height; the `-2x` variants double the 96-DPI geometry exactly. */
  const RASTERS = [
    ['brand.png', 600, 196],
    ['brand-2x.png', 1200, 392],
    ['brand-dark.png', 600, 196],
    ['brand-dark-2x.png', 1200, 392],
  ] as const
  /** Chip plate and wordmark band geometry, mirroring scripts/generate-installer-brand.mjs. */
  const CHIP = { x: 240, y: 16, size: 120 }
  // The wordmark sits on `baselineY: 187` at `fontSize: 32`, so its ink occupies
  // roughly y155..188. The band starts above the cap height and stops at the
  // canvas bottom; it must not reach the chip, which ends at y136.
  const WORDMARK = { y: 150, height: 46 }
  /** Measured separation: the colourful product mark scores ~0.67, upstream's glyph ~0.03. */
  const MIN_SATURATED_SHARE = 0.25
  /** Measured wordmark ink width: the fork name 147px, the upstream name 202px. */
  const MAX_WORDMARK_INK_WIDTH = 175

  const raw = async (relative: string) => {
    const { data, info } = await sharp(fileURLToPath(new URL(relative, import.meta.url)))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, info }
  }

  const measure = (
    data: Buffer,
    width: number,
    channels: number,
    rect: { x: number; y: number; w: number; h: number },
    isInk: (r: number, g: number, b: number, a: number) => boolean,
  ) => {
    let ink = 0, saturated = 0, minX = Number.POSITIVE_INFINITY, maxX = -1
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = (y * width + x) * channels
        const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0, a = data[i + 3] ?? 0
        if (!isInk(r, g, b, a)) continue
        ink++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        if (max !== 0 && (max - min) / max > 0.25) saturated++
      }
    }
    return { ink, saturated, inkWidth: maxX < 0 ? 0 : maxX - minX + 1 }
  }

  it('draws the canonical mark in colour, so the plate guard has real separation', async () => {
    const { data, info } = await raw('../../web/public/favicon.png')
    const { ink, saturated } = measure(data, info.width, info.channels,
      { x: 0, y: 0, w: info.width, h: info.height }, (_r, _g, _b, a) => a > 128)
    expect(ink).toBeGreaterThan(1000)
    expect(saturated / ink).toBeGreaterThanOrEqual(MIN_SATURATED_SHARE)
  })

  it.each(RASTERS)('ships the product mark in %s, not a monochrome upstream glyph', async (name, width, height) => {
    const { data, info } = await raw(`../installer/assets/${name}`)
    expect(info.width).toBe(width)
    expect(info.height).toBe(height)
    const scale = width / 600
    // The plate is a near-white chip, so anything meaningfully darker is the mark.
    const plate = measure(data, info.width, info.channels, {
      x: CHIP.x * scale, y: CHIP.y * scale, w: CHIP.size * scale, h: CHIP.size * scale,
    }, (r, g, b) => Math.max(r, g, b) / 255 < 0.9)
    expect(plate.ink).toBeGreaterThan(500 * scale * scale)
    expect(plate.saturated / plate.ink).toBeGreaterThanOrEqual(MIN_SATURATED_SHARE)

    // The wordmark band carries the fork's name, not upstream's longer one. Both
    // variants keep the band transparent outside the glyphs, so alpha separates
    // the ink from the flattened background the ps1 adds later.
    const band = measure(data, info.width, info.channels, {
      x: 0, y: WORDMARK.y * scale, w: info.width, h: WORDMARK.height * scale,
    }, (_r, _g, _b, a) => a > 128)
    expect(band.ink).toBeGreaterThan(200 * scale * scale)
    expect(band.inkWidth / scale).toBeLessThanOrEqual(MAX_WORDMARK_INK_WIDTH)
  })

  it('redraws the sidebar artwork NSIS reserves for the welcome pages', async () => {
    const { data, info } = await raw('../installer/assets/uninstaller-sidebar.png')
    expect([info.width, info.height]).toEqual([164, 314])
    const { ink, saturated } = measure(data, info.width, info.channels,
      { x: 0, y: 0, w: info.width, h: info.height }, (r, g, b) => Math.max(r, g, b) / 255 < 0.9)
    expect(ink).toBeGreaterThan(500)
    expect(saturated / ink).toBeGreaterThanOrEqual(MIN_SATURATED_SHARE)
  })
})

// FORK DIVERGENCE: upstream sized the path field to 360 logical pixels, which
// clips the *real* default per-user installation path
// (`%LOCALAPPDATA%\Programs\BirdCoder`, 52 characters, ~364px at this font) once
// Windows scales the dialog — the field's right edge cut the tail off with no
// affordance. The row now spans the 504px band the status label already occupies.
// Every part derives from `theme.nsh`, because a bitmap static centres its image
// instead of stretching it: a frame bitmap narrower than its control drifts off
// the field rather than failing loudly.
describe('Windows installer path row geometry', () => {
  /** The status label's band, which the widened path row now matches. */
  const ROW_SPAN = 504

  const defines = (): Map<string, number> => {
    const values = new Map<string, number>()
    const source = readFileSync(new URL('../installer/theme.nsh', import.meta.url), 'utf8')
    for (const line of source.split('\n')) {
      const match = /^!define (INSTALLER_[A-Z_]+) (\d+)$/u.exec(line.trim())
      if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], Number(match[2]))
    }
    return values
  }
  const value = (values: Map<string, number>, name: string): number => {
    const found = values.get(name)
    expect(found, `${name} must be defined in installer/theme.nsh`).toBeTypeOf('number')
    return found ?? Number.NaN
  }

  it('derives the frame, the field and the browse button from one set of defines', () => {
    const values = defines()
    const frameX = value(values, 'INSTALLER_PATH_FRAME_X')
    const frameW = value(values, 'INSTALLER_PATH_FRAME_W')
    const inset = value(values, 'INSTALLER_PATH_INSET')
    expect(value(values, 'INSTALLER_PATH_EDIT_X')).toBe(frameX + inset)
    expect(value(values, 'INSTALLER_PATH_EDIT_W')).toBe(frameW - 2 * inset)
    expect(value(values, 'INSTALLER_BROWSE_X')).toBe(frameX + frameW + 8)
    expect(value(values, 'INSTALLER_BROWSE_X') + value(values, 'INSTALLER_BROWSE_W')).toBe(frameX + ROW_SPAN)
    // The widening is the point of the divergence: upstream's 360px field left the
    // default path's tail outside the frame.
    expect(value(values, 'INSTALLER_PATH_EDIT_W')).toBeGreaterThanOrEqual(400)
  })

  it('leaves no literal geometry in the scripts that draw the row', () => {
    const pages = nsisCode(readFileSync(new URL('../installer/pages.nsh', import.meta.url), 'utf8'))
    expect(pages).toContain('${INSTALLER_PATH_FRAME_W}')
    expect(pages).toContain('${INSTALLER_PATH_EDIT_W}')
    expect(pages).toContain('${INSTALLER_BROWSE_X}')
    expect(pages).not.toContain('384 34')
    expect(pages).not.toContain(' 456 434 80 34')

    const drawing = nsisCode(readFileSync(new URL('../installer/drawing.nsh', import.meta.url), 'utf8'))
    expect(drawing).toContain('MulDiv(i ${INSTALLER_PATH_FRAME_W}')
    expect(drawing).not.toContain('MulDiv(i 384')
  })
})

// FORK DIVERGENCE (AGENTS.md, "Desktop shell display copy"): install-time copy is
// a fork-owned display surface and names the product BirdCoder, as does the About
// panel. The rasters are guarded above; this guards the words around them.
describe('installer and About-panel display copy', () => {
  it('names BirdCoder, never the upstream product, in the installer strings', () => {
    const strings = readFileSync(new URL('../installer/strings.nsh', import.meta.url), 'utf8')
    expect(strings).not.toContain('DeepSeek Harness')
    expect(strings.match(/BirdCoder/gu)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('names BirdCoder in the About panel', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
    expect(main).toContain("applicationName: 'BirdCoder'")
    expect(main).not.toContain("applicationName: 'DeepSeek Harness'")
  })
})
