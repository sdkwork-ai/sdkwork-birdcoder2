import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { NotarizeOptions } from '@electron/notarize'
import {
  resolveDesktopAppId,
  resolveMacOSNotarizationEnvironment,
  resolveMacOSSigningEnvironment,
} from '../scripts/desktop-release-environment.mjs'
import { notarizeMacOSDiskImageArtifact } from '../scripts/notarize-macos-disk-images.mjs'
import {
  assertMacOSRuntimeSignatureDetails,
  assertMacOSSignatureDetails,
} from '../scripts/verify-macos-signature.mjs'

const RELEASE_ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.desktop',
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
  DSH_DESKTOP_TARGET_ARCH: 'arm64',
  DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
  DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
  APPLE_API_KEY: '/private/credentials/AuthKey_TEST123456.p8',
  APPLE_API_KEY_ID: 'TEST123456',
  APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555',
  DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com', DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
}

function portablePath(value: string): string {
  return value.replaceAll('\\', '/')
}

describe('desktop macOS release signature', () => {
  beforeAll(() => {
    for (const [name, value] of Object.entries(RELEASE_ENVIRONMENT)) vi.stubEnv(name, value)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('loads release identifiers from the environment and requires code signing', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig(RELEASE_ENVIRONMENT, 'darwin', 'arm64')
    expect(config.protocols).toEqual([{ name: 'BirdCoder', schemes: ['birdcoder'] }])
    expect(portablePath(config.directories.output)).toContain('/.desktop-build/targets/mac-arm64/artifacts')
    expect(config.mac.extendInfo.NSMicrophoneUsageDescription).toContain('microphone')
    expect(config.mac.entitlementsInherit).toBe(config.mac.entitlements)
    const entitlements = readFileSync(config.mac.entitlements, 'utf8')
    for (const key of ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation', 'com.apple.security.device.audio-input']) {
      expect(entitlements).toContain(`<key>${key}</key>\n    <true/>`)
    }
    expect(config.extraResources).toHaveLength(2)
    expect(config.extraResources[0]?.to).toBe('runtime')
    expect(portablePath(config.extraResources[0]?.from ?? '')).toContain('/.desktop-build/targets/mac-arm64/runtime')
    // FORK DIVERGENCE: the fork appends its externalised-runtime patch mappings after
    // these two, so the dsh entries are located by destination rather than by position.
    const dshFiles = config.files.find(entry => typeof entry !== 'string' && entry.to === 'dsh')
    const dshNodeModules = config.files.find(entry => typeof entry !== 'string' && entry.to === 'dsh/node_modules')
    if (!dshFiles || !dshNodeModules || typeof dshFiles === 'string' || typeof dshNodeModules === 'string') {
      throw new Error('desktop DSH resources must use electron-builder file mappings')
    }
    expect(portablePath(dshFiles.from)).toContain('/.desktop-build/targets/mac-arm64/dsh')
    expect(dshFiles.to).toBe('dsh')
    expect(portablePath(dshNodeModules.from)).toContain('/.desktop-build/targets/mac-arm64/dsh/node_modules')
    expect(dshNodeModules.to).toBe('dsh/node_modules')
    expect(config.asarUnpack).toEqual(expect.arrayContaining([
      '**/*.{node,dylib,dll,so,exe}',
      '**/@vscode/ripgrep-*/bin/rg',
    ]))
    expect(config).toMatchObject({
      appId: RELEASE_ENVIRONMENT.DSH_DESKTOP_APP_ID,
      mac: {
        identity: RELEASE_ENVIRONMENT.DSH_DESKTOP_MACOS_SIGNING_IDENTITY,
        forceCodeSigning: true,
        notarize: true,
        signIgnore: ['/Contents/Resources/app\\.asar\\.unpacked/dsh(?:/|$)', '/Contents/Resources/runtime/primary-runtime(?:/|$)', '\\.pak$'],
      },
      dmg: {
        sign: true,
        // FORK DIVERGENCE: upstream sets this false, which makes dmg-builder skip
        // the blockmap and the DMG's `latest-mac.yml` entry. The release contract
        // requires `BirdCoder-<version>-mac-<arch>.dmg.blockmap` and a DMG entry
        // in the macOS channel file, so the fork keeps both.
        writeUpdateInfo: true,
      },
      publish: [{
        provider: 'generic',
        url: 'https://desktop-updates.example.com/dsh-desk/0123456789abcdef0123456789abcdef/feeds/mac-arm64/',
        // FORK DIVERGENCE: upstream pins `channel: 'nightly'` here. The fork
        // leaves it unset on purpose — electron-builder then emits `latest.yml`
        // while the upload plan publishes `nightly.yml` alongside it for the
        // runtime's `updater.channel` selection (desktop-upload-plan.spec
        // asserts both feed names; the config comment records the decision).
      }],
    })
    expect(typeof config.artifactBuildCompleted).toBe('function')
  })

  it('seals PAK resources with their enclosing bundle while signing executable code', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig(RELEASE_ENVIRONMENT, 'darwin', 'arm64')
    const ignored = (path: string): boolean => config.mac.signIgnore.some(pattern => new RegExp(pattern).test(path))
    expect(ignored('/App.app/Contents/Frameworks/Electron.framework/Versions/A/Resources/en.lproj/locale.pak')).toBe(true)
    expect(ignored('/App.app/Contents/Frameworks/Electron.framework/Versions/A/Resources/resources.pak')).toBe(true)
    expect(ignored('/App.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/addon.node')).toBe(true)
    for (const path of [
      '/App.app/Contents/Resources/runtime/node/node',
      '/App.app/Contents/Frameworks/Electron.framework/Versions/A/library.dylib',
      '/App.app/Contents/Frameworks/Electron.framework',
      '/App.app',
    ]) expect(ignored(path)).toBe(false)
  })

  it('validates Windows signing without requiring macOS identifiers for a Windows target', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    expect(() => createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: RELEASE_ENVIRONMENT.DSH_DESKTOP_APP_ID,
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
    }, 'win32')).toThrow(/DSH_DESKTOP_WINDOWS_CER_FILE/u)
  })

  it('isolates unsigned Windows artifacts and still names them for the release contract', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: RELEASE_ENVIRONMENT.DSH_DESKTOP_APP_ID,
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'win32', 'x64')
    expect(portablePath(config.directories.output)).toContain('/targets/win-x64/unsigned-artifacts')
    // The fork binds the include to the generated per-target wrapper, not the
    // repo script (see installer-packaging.spec's wrapper contract).
    expect(portablePath(config.nsis.include)).toMatch(/\/installer-ui\/installer-include\.nsh$/u)
    // The assembly job asserts this exact spelling, and the arch token is
    // electron-builder's per-format one (x64, x86_64, amd64).
    expect(config.artifactName).toBe('BirdCoder-${version}-${os}-${arch}.${ext}')
    // Updater metadata is written only when a publish provider is configured,
    // and the release contract requires all four `latest*.yml` channel files.
    expect(config.publish).toEqual([{ provider: 'github', owner: 'sdkwork-ai', repo: 'sdkwork-birdcoder2' }])
    expect(config).toMatchObject({
      win: { forceCodeSigning: false, signtoolOptions: { sign: undefined }, target: ['nsis', 'zip'] },
    })
  })

  // FORK DIVERGENCE: upstream rejects an unsigned macOS build outright, because
  // it only ever packaged macOS from a host holding a release identity. The
  // fork's GitHub Release is packaged without one on any platform, so this test
  // merges upstream's local-DMG expectations with the fork's own asset set:
  // its artifact spelling, its DMG-plus-ZIP target list, and its blockmap-
  // carrying DMG (see the neighboring comment).
  it.each(['arm64', 'x64'])('packages a local unsigned macOS %s build without credentials or updater metadata', async (arch) => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: RELEASE_ENVIRONMENT.DSH_DESKTOP_APP_ID,
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'darwin', arch)
    expect(portablePath(config.directories.output)).toContain(`/targets/mac-${arch}/unsigned-artifacts`)
    // The fork appends no `-unsigned` marker: the assembly job asserts this exact
    // spelling on all six release lanes (see the builder config).
    expect(config.artifactName).toBe('BirdCoder-${version}-${os}-${arch}.${ext}')
    expect(config.mac.identity).toBe('-')
    expect(config.mac).toMatchObject({ forceCodeSigning: false, notarize: false, target: ['dmg', 'zip'] })
    expect(config.dmg).toMatchObject({ sign: false, writeUpdateInfo: true })
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    // Upstream returns before this hook on an unsigned run, and so does the fork;
    // the guard is what keeps the run from demanding the credentials it dropped.
    await expect(config.afterSign({ electronPlatformName: 'darwin' } as Parameters<typeof config.afterSign>[0])).resolves.toBeUndefined()
    expect(config.artifactBuildCompleted({ file: '/tmp/local-unsigned.dmg' })).toBeUndefined()
  })

  it('omits mandatory-update policy from local macOS builds even when release settings are supplied', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig({
      ...RELEASE_ENVIRONMENT, DSH_DESKTOP_TARGET_PLATFORM: 'darwin', DSH_DESKTOP_UNSIGNED: '1',
    }, 'darwin', 'arm64')
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    // FORK DIVERGENCE: upstream sets `publish` to null here. The fork keeps the
    // GitHub provider because electron-builder writes the updater metadata — all
    // four `latest*.yml` channel files — only when a provider is configured, and
    // the release contract requires them beside the unsigned installers.
    expect(config.publish).toEqual([{ provider: 'github', owner: 'sdkwork-ai', repo: 'sdkwork-birdcoder2' }])
  })

  it('rejects malformed signing modes', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    expect(() => createElectronBuilderConfig({ ...RELEASE_ENVIRONMENT, DSH_DESKTOP_UNSIGNED: 'yes' }))
      .toThrow(/must be 0 or 1/u)
  })

  it('leaves the post-pack hook free of the runtime tree the asar move put out of reach', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: RELEASE_ENVIRONMENT.DSH_DESKTOP_APP_ID,
      DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
      DSH_DESKTOP_TARGET_ARCH: 'arm64',
      DSH_DESKTOP_UNSIGNED: '1',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: RELEASE_ENVIRONMENT.DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN,
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: RELEASE_ENVIRONMENT.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG,
    }, 'darwin', 'arm64')
    const root = await mkdtemp(join(tmpdir(), 'desktop-after-sign-'))
    try {
      // Upstream's asar move leaves the host tree inside `app.asar` (its native
      // files under `app.asar.unpacked/`), so a packaged bundle carries no
      // `Contents/Resources/dsh` for a post-pack step to open. Running the hook
      // against exactly that bundle layout keeps a retired `verifyDesktopRuntime`
      // call from returning through an upstream merge: while it was present every
      // macOS target died with ENOENT after the bundle was already built, and
      // Windows and Linux stayed green because this hook is darwin-only. The fork's
      // unsigned lane returns before the signing block for the same reason — it
      // holds no identity to verify against — and `scripts/prepare-dsh.ts` owns the
      // runtime check, before electron-builder is invoked.
      const appOutDir = join(root, 'mac-arm64')
      await mkdir(join(appOutDir, 'BirdCoder.app', 'Contents', 'Resources'), { recursive: true })
      await expect(config.afterSign({
        electronPlatformName: 'darwin',
        appOutDir,
        packager: { appInfo: { productFilename: 'BirdCoder', version: '1.2.3-alpha.1' } },
      })).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts the configured authority and team', () => {
    const expected = resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT)
    expect(() => {
      assertMacOSSignatureDetails([
        `Authority=Developer ID Application: ${expected.signingIdentity}`,
        `TeamIdentifier=${expected.teamId}`,
      ].join('\n'), expected)
    }).not.toThrow()
  })

  it('requires a secure timestamp and hardened runtime for runtime code', () => {
    const expected = resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT)
    const details = [
      `Authority=Developer ID Application: ${expected.signingIdentity}`,
      `TeamIdentifier=${expected.teamId}`,
      'Timestamp=31 Aug 2026 at 20:00:00',
      'CodeDirectory v=20500 size=773 flags=0x10000(runtime) hashes=13+7 location=embedded',
    ].join('\n')
    expect(() => { assertMacOSRuntimeSignatureDetails(details, expected) }).not.toThrow()
    expect(() => {
      assertMacOSRuntimeSignatureDetails(details.replace(/^Timestamp=.*\n/um, ''), expected)
    }).toThrow(/secure timestamp/u)
    expect(() => {
      assertMacOSRuntimeSignatureDetails(details.replace('flags=0x10000(runtime)', 'flags=0x0(none)'), expected)
    }).toThrow(/hardened runtime/u)
  })

  it('rejects another developer identity', () => {
    const expected = resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT)
    expect(() => {
      assertMacOSSignatureDetails([
        'Authority=Developer ID Application: Other Company (OTHERID123)',
        'TeamIdentifier=OTHERID123',
      ].join('\n'), expected)
    }).toThrow(/release identity/u)
  })

  it('rejects an unexpected team even when the authority is present', () => {
    const expected = resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT)
    expect(() => {
      assertMacOSSignatureDetails([
        `Authority=Developer ID Application: ${expected.signingIdentity}`,
        'TeamIdentifier=OTHERID123',
      ].join('\n'), expected)
    }).toThrow(`TeamIdentifier=${expected.teamId}`)
  })

  it('rejects missing and malformed release identifiers', () => {
    expect(() => resolveDesktopAppId({})).toThrow(/DSH_DESKTOP_APP_ID/u)
    expect(() => resolveDesktopAppId({ DSH_DESKTOP_APP_ID: 'not-a-bundle-id' })).toThrow(/reverse-DNS/u)
    expect(() => resolveMacOSSigningEnvironment({})).toThrow(/DSH_DESKTOP_MACOS_SIGNING_IDENTITY/u)
    expect(() => resolveMacOSSigningEnvironment({
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Developer ID Application: Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234',
    })).toThrow(/must omit/u)
    expect(() => resolveMacOSSigningEnvironment({
      DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)',
      DSH_DESKTOP_MACOS_TEAM_ID: 'short',
    })).toThrow(/10 uppercase/u)
  })

  it('requires one complete notarization credential strategy', () => {
    expect(resolveMacOSNotarizationEnvironment(RELEASE_ENVIRONMENT)).toEqual({
      appleApiKey: RELEASE_ENVIRONMENT.APPLE_API_KEY,
      appleApiKeyId: RELEASE_ENVIRONMENT.APPLE_API_KEY_ID,
      appleApiIssuer: RELEASE_ENVIRONMENT.APPLE_API_ISSUER,
    })
    expect(resolveMacOSNotarizationEnvironment({
      APPLE_KEYCHAIN_PROFILE: 'dsh-notary',
    })).toEqual({ keychainProfile: 'dsh-notary' })
    expect(() => resolveMacOSNotarizationEnvironment({})).toThrow(/macOS packaging requires/u)
    expect(() => resolveMacOSNotarizationEnvironment({ APPLE_API_KEY: '/tmp/key.p8' })).toThrow(/APPLE_API_KEY_ID/u)
  })

  it('notarizes and qualifies a DMG before electron-builder publishes it', async () => {
    const submitted: string[] = []
    const submit = vi.fn(async (options: NotarizeOptions) => { submitted.push(options.appPath) })
    const verified: string[] = []
    const verify = vi.fn((path: string) => { verified.push(path) })
    await notarizeMacOSDiskImageArtifact(
      { file: '/tmp/release.dmg' },
      RELEASE_ENVIRONMENT,
      resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT),
      submit,
      verify,
    )
    await notarizeMacOSDiskImageArtifact(
      { file: '/tmp/release.zip' },
      RELEASE_ENVIRONMENT,
      resolveMacOSSigningEnvironment(RELEASE_ENVIRONMENT),
      submit,
      verify,
    )
    expect(submitted).toEqual(['/tmp/release.dmg'])
    expect(verified).toEqual(['/tmp/release.dmg'])
  })
})
