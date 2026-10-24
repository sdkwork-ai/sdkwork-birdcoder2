import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  desktopTargetBuildPaths,
  desktopTargetPlatform,
  developmentRuntimeDirectory,
  resolveDesktopBuildTarget,
  resolveDesktopTargetBuildPaths,
} from '../scripts/desktop-build-paths.mjs'

/** The six targets the fork publishes; upstream packages three of them. */
const TARGETS = [
  'mac-arm64',
  'mac-x64',
  'win-x64',
  'win-arm64',
  'linux-x64',
  'linux-arm64',
] as const

describe('desktop build paths', () => {
  it('isolates every mutable build directory by complete target', () => {
    // FORK DIVERGENCE: the release contract's six targets each own their build
    // state, so no two of them may share a mutable directory.
    const paths = TARGETS.map(target => desktopTargetBuildPaths(target))
    const mutableKeys = [
      'root',
      'artifacts',
      'unsignedArtifacts',
      'unnotarizedArtifacts',
      'runtime',
      'packageSet',
      'dsh',
      'dshPnpm',
      'electron',
      'packedDsh',
      'packedVendor',
      'packedLandlock',
    ] as const

    for (const key of mutableKeys) {
      expect(new Set(paths.map(entry => entry[key])).size).toBe(TARGETS.length)
    }
    expect(desktopTargetBuildPaths('mac-arm64').artifacts)
      .toContain(join('targets', 'mac-arm64', 'artifacts'))
    expect(desktopTargetBuildPaths('mac-x64').dsh).toContain(join('targets', 'mac-x64', 'dsh'))
    expect(desktopTargetBuildPaths('win-x64').runtime).toContain(join('targets', 'win-x64', 'runtime'))
    expect(desktopTargetBuildPaths('linux-arm64').artifacts)
      .toContain(join('targets', 'linux-arm64', 'artifacts'))
  })

  it('shares only the immutable upstream download cache', () => {
    // FORK DIVERGENCE: the six-target release pins every target to one shared
    // downloads cache, so the fork checks the full target set, not just macOS.
    const downloads = TARGETS.map(target => desktopTargetBuildPaths(target).downloads)
    expect(new Set(downloads).size).toBe(1)
    expect(downloads[0]).not.toContain(`${sep}targets${sep}`)
  })

  it('shares download and package caches outside target output directories', () => {
    const arm64 = desktopTargetBuildPaths('mac-arm64')
    const x64 = desktopTargetBuildPaths('mac-x64')
    expect(arm64.downloads).toBe(x64.downloads)
    expect(arm64.downloads).not.toContain(`${sep}targets${sep}`)
    expect(arm64.pnpmStore).toBe(x64.pnpmStore)
    expect(arm64.pnpmStore).not.toContain(`${sep}targets${sep}`)
  })

  it('retains target outputs while relocating caches through the supplied environment', () => {
    const cache = resolve('external-package-cache')
    const environment = { DSH_DESKTOP_PACKAGE_CACHE_DIR: cache }
    const defaults = desktopTargetBuildPaths('win-x64', {})
    const paths = resolveDesktopTargetBuildPaths(environment, 'win32', 'x64')
    expect(paths).toEqual({ ...defaults, downloads: join(cache, 'downloads'), pnpmStore: join(cache, 'pnpm-store') })
    expect(desktopTargetBuildPaths('mac-arm64', environment).pnpmStore).toBe(paths.pnpmStore)
    for (const target of ['mac-arm64', 'mac-x64', 'win-x64'] as const) {
      const configured = desktopTargetBuildPaths(target, environment)
      expect(configured.downloads).toBe(join(cache, 'downloads'))
      expect(configured.pnpmStore).toBe(join(cache, 'pnpm-store'))
      expect(configured.root).not.toContain(cache)
    }
    expect(defaults.pnpmStore).toBe(resolve(defaults.root, '../..', 'pnpm-store'))
  })

  it.each(['', ' ', 'relative/cache', './cache', 'cache\0invalid'])('rejects invalid cache directory %j', (directory) => {
    expect(() => desktopTargetBuildPaths('win-x64', { DSH_DESKTOP_PACKAGE_CACHE_DIR: directory }))
      .toThrow('DSH_DESKTOP_PACKAGE_CACHE_DIR')
  })

  it('resolves the development primary runtime from the build target rather than the host architecture', () => {
    expect(developmentRuntimeDirectory({}, 'darwin', 'arm64'))
      .toContain(join('targets', 'mac-arm64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'darwin', 'x64'))
      .toContain(join('targets', 'mac-x64', 'runtime', 'primary-runtime'))
    // FORK DIVERGENCE: upstream prepares Windows as x64 only, so its launcher has to report
    // the win-x64 runtime for an arm64 Windows host. The fork packages win-arm64 as well, so
    // the directory follows the host's own architecture on both Windows architectures.
    expect(developmentRuntimeDirectory({}, 'win32', 'arm64'))
      .toContain(join('targets', 'win-arm64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'win32', 'x64'))
      .toContain(join('targets', 'win-x64', 'runtime', 'primary-runtime'))
  })

  it('maps every target to the platform and architecture of the payload it prepares', () => {
    expect(desktopTargetPlatform('mac-arm64')).toEqual({ platform: 'darwin', arch: 'arm64' })
    expect(desktopTargetPlatform('mac-x64')).toEqual({ platform: 'darwin', arch: 'x64' })
    expect(desktopTargetPlatform('win-x64')).toEqual({ platform: 'win32', arch: 'x64' })
    // FORK DIVERGENCE: upstream's three-target lane never had to describe a Windows arm64 or
    // Linux payload, so it reported those as macOS x64.
    expect(desktopTargetPlatform('win-arm64')).toEqual({ platform: 'win32', arch: 'arm64' })
    expect(desktopTargetPlatform('linux-x64')).toEqual({ platform: 'linux', arch: 'x64' })
    expect(desktopTargetPlatform('linux-arm64')).toEqual({ platform: 'linux', arch: 'arm64' })
  })

  it('resolves environment overrides and rejects unsupported targets', () => {
    expect(resolveDesktopBuildTarget({
      DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
    }, 'darwin', 'arm64')).toBe('mac-x64')
    expect(resolveDesktopBuildTarget({}, 'win32', 'x64')).toBe('win-x64')
    // FORK DIVERGENCE: the six-target release resolves Windows arm64 and both
    // Linux architectures, which upstream's three-target set rejected outright.
    expect(resolveDesktopBuildTarget({}, 'win32', 'arm64')).toBe('win-arm64')
    expect(resolveDesktopBuildTarget({}, 'linux', 'x64')).toBe('linux-x64')
    expect(resolveDesktopBuildTarget({}, 'linux', 'arm64')).toBe('linux-arm64')
    expect(() => resolveDesktopBuildTarget({}, 'linux', 'ia32')).toThrow(/unsupported target/u)
    expect(() => desktopTargetBuildPaths('freebsd-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })

  it('moves the whole build tree under DSH_DESKTOP_BUILD_ROOT and reads a blank value as unset', async () => {
    // FORK DIVERGENCE: the release workflow points the Windows lanes at a short
    // root (the packaged Office engine cannot load its own resources from a deep
    // path) and leaves the variable blank on the four targets without that limit,
    // so both the override and the blank fallback are part of the contract.
    const previous = process.env.DSH_DESKTOP_BUILD_ROOT
    const override = join(tmpdir(), 'dsh-build-root')
    try {
      process.env.DSH_DESKTOP_BUILD_ROOT = override
      vi.resetModules()
      const moved = await import('../scripts/desktop-build-paths.mjs')
      expect(moved.desktopTargetBuildPaths('win-x64').unsignedArtifacts)
        .toContain(join(override, 'targets', 'win-x64', 'unsigned-artifacts'))
      expect(moved.desktopTargetBuildPaths('win-x64').downloads).toContain(join(override, 'downloads'))

      process.env.DSH_DESKTOP_BUILD_ROOT = '   '
      vi.resetModules()
      const blank = await import('../scripts/desktop-build-paths.mjs')
      expect(blank.desktopTargetBuildPaths('win-x64').unsignedArtifacts)
        .toContain(join('.desktop-build', 'targets', 'win-x64', 'unsigned-artifacts'))
    } finally {
      if (previous === undefined) delete process.env.DSH_DESKTOP_BUILD_ROOT
      else process.env.DSH_DESKTOP_BUILD_ROOT = previous
      vi.resetModules()
    }
  })
})
