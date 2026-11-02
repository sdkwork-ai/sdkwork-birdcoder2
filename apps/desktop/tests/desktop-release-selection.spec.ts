import { expect, it } from 'vitest'
import { DESKTOP_TARGET_NAMES } from '../scripts/desktop-build-paths.mjs'
import { resolveDesktopReleaseSelection } from '../scripts/resolve-desktop-release-selection.mjs'

const MANIFEST_VERSION = '0.2.2-alpha.4'

it('packages every target and follows the manifest when the request names neither', () => {
  expect(resolveDesktopReleaseSelection({ version: '', targets: 'all' }, MANIFEST_VERSION)).toEqual({
    version: MANIFEST_VERSION,
    targets: [...DESKTOP_TARGET_NAMES],
    partial: false,
  })
  expect(resolveDesktopReleaseSelection({ version: '', targets: '  ' }, MANIFEST_VERSION).targets)
    .toEqual([...DESKTOP_TARGET_NAMES])
})

it('repackages the targets one selection names in release order', () => {
  expect(resolveDesktopReleaseSelection({ version: MANIFEST_VERSION, targets: 'linux-arm64, win-x64' }, MANIFEST_VERSION))
    .toMatchObject({ targets: ['win-x64', 'linux-arm64'], partial: true })
  expect(resolveDesktopReleaseSelection({ version: MANIFEST_VERSION, targets: 'win-arm64' }, MANIFEST_VERSION))
    .toMatchObject({ targets: ['win-arm64'], partial: true })
})

it('accepts only a version the manifest declares', () => {
  expect(resolveDesktopReleaseSelection({ version: MANIFEST_VERSION, targets: 'all' }, MANIFEST_VERSION).version)
    .toBe(MANIFEST_VERSION)
  expect(() => resolveDesktopReleaseSelection({ version: '0.2.1', targets: 'all' }, MANIFEST_VERSION))
    .toThrow(/does not match package\.json/u)
})

it('rejects selections a maintainer cannot intend', () => {
  const unknown = () => resolveDesktopReleaseSelection({ version: '', targets: 'win-x32' }, MANIFEST_VERSION)
  expect(unknown).toThrow(/unknown target "win-x32"/u)
  for (const name of DESKTOP_TARGET_NAMES) expect(unknown).toThrow(name)
  expect(() => resolveDesktopReleaseSelection({ version: '', targets: 'win-x64,,mac-x64' }, MANIFEST_VERSION))
    .toThrow(/empty entry/u)
  expect(() => resolveDesktopReleaseSelection({ version: '', targets: 'mac-x64, mac-x64' }, MANIFEST_VERSION))
    .toThrow(/more than once/u)
  expect(() => resolveDesktopReleaseSelection({ version: '', targets: 'all, win-x64' }, MANIFEST_VERSION))
    .toThrow(/unknown target "all"/u)
})
