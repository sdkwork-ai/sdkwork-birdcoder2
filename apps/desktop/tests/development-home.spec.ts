/** A source Desktop lane owns its own Harness home unless it is asked for another one. */

import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectDevelopmentHome } from '../scripts/development-home.ts'

const LANE_HOME = resolve('/lane/home')
const INSTALLED_HOME = resolve('/home/.birdcoder')
const LEGACY_HOME = resolve('/home/.dsh')

/** One selection against the shipped brand's two possible installed homes. */
function select(environment: NodeJS.ProcessEnv, allowInstalledHome = false) {
  return selectDevelopmentHome({
    environment,
    laneHome: LANE_HOME,
    installedHomes: [INSTALLED_HOME, LEGACY_HOME],
    allowInstalledHome,
  })
}

describe('selectDevelopmentHome', () => {
  it('defaults to the lane home when no DSH_HOME is set', () => {
    expect(select({})).toEqual({ home: LANE_HOME, source: 'lane' })
    expect(select({ DSH_HOME: '   ' })).toEqual({ home: LANE_HOME, source: 'lane' })
  })

  it('honours an explicit DSH_HOME no installation owns', () => {
    const home = resolve('/work/dev-home')
    expect(select({ DSH_HOME: home })).toEqual({ home, source: 'environment' })
  })

  it('keeps the lane home when the environment exports the installed home', () => {
    for (const installed of [INSTALLED_HOME, LEGACY_HOME]) {
      const selection = select({ DSH_HOME: installed })
      expect(selection.home).toBe(LANE_HOME)
      expect(selection.source).toBe('lane')
      expect(selection.notice).toContain(installed)
      expect(selection.notice).toContain('DSH_DESKTOP_DEV_INSTALLED_HOME=1')
    }
  })

  it('compares normalised spellings of the same directory', () => {
    const written = `${join(INSTALLED_HOME, 'profiles', '..')}${sep}`
    expect(select({ DSH_HOME: written }).home).toBe(LANE_HOME)
  })

  it.runIf(process.platform === 'win32')('compares Windows paths case-insensitively', () => {
    expect(select({ DSH_HOME: INSTALLED_HOME.toUpperCase() }).home).toBe(LANE_HOME)
  })

  it('targets the installed home when the developer opts in', () => {
    expect(select({ DSH_HOME: INSTALLED_HOME }, true)).toEqual({
      home: INSTALLED_HOME,
      source: 'installed',
    })
  })
})
