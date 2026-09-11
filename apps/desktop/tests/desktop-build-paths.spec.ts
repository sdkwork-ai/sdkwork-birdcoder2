import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopTargetBuildPaths,
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
      'runtime',
      'packageSet',
      'dsh',
      'dshPnpm',
      'nodeExtract',
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
