import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopTargetBuildPaths,
  desktopTargetPlatform,
  developmentRuntimeDirectory,
  resolveDesktopBuildTarget,
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
    const downloads = TARGETS.map(target => desktopTargetBuildPaths(target).downloads)
    expect(new Set(downloads).size).toBe(1)
    expect(downloads[0]).not.toContain(`${sep}targets${sep}`)
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
})
