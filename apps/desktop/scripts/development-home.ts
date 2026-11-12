/**
 * Harness home of a source Desktop launch.
 *
 * A lane's documented default home is its own state directory, because the
 * installed application keeps the brand home for the person using it. `DSH_HOME`
 * overrides that default for a developer who targets a dedicated directory, but
 * the installed application exports its home to every child process, so a launch
 * started from a terminal inside BirdCoder inherits the brand home through no
 * decision of its own. Adopting it would put two Hosts on one profile: the
 * installed application keeps `profiles/desktop`, and the assistant's operational
 * database refuses the second writer. The launcher therefore keeps the lane home
 * for an inherited installed home and says so; `DSH_DESKTOP_DEV_INSTALLED_HOME=1`
 * targets it deliberately.
 *
 * @module apps/desktop/scripts/development-home
 */

import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/** Where a launch's Harness home came from. */
export type DevelopmentHomeSource =
  /** The lane's own state directory. */
  | 'lane'
  /** An explicit `DSH_HOME` that no installation owns. */
  | 'environment'
  /** The installed application's home, targeted on purpose. */
  | 'installed'

/** Inputs for {@link selectDevelopmentHome}. */
export interface DevelopmentHomeInputs {
  /** Launch environment, read for `DSH_HOME`. */
  readonly environment: NodeJS.ProcessEnv
  /** The lane's own state directory, used when no other home applies. */
  readonly laneHome: string
  /** Harness homes the installed application may own on this machine. */
  readonly installedHomes: readonly string[]
  /** Whether the developer asked for an installed home through its opt-in. */
  readonly allowInstalledHome?: boolean
}

/** Resolved home of one source launch. */
export interface DevelopmentHomeSelection {
  /** Absolute home this launch and every child process use. */
  readonly home: string
  /** Which input decided {@link home}. */
  readonly source: DevelopmentHomeSource
  /** One-line explanation for the console when an inherited home was replaced. */
  readonly notice?: string
}

/**
 * Resolve one source launch's Harness home.
 * @param inputs - Environment, lane home, and the homes an installation owns.
 * @returns the home to export, and why it was chosen.
 */
export function selectDevelopmentHome(inputs: DevelopmentHomeInputs): DevelopmentHomeSelection {
  const laneHome = resolve(inputs.laneHome)
  const configured = (inputs.environment.DSH_HOME ?? '').trim()
  if (configured === '') return { home: laneHome, source: 'lane' }
  const selected = canonicalPath(configured)
  const installed = inputs.installedHomes.map(canonicalPath)
  if (!installed.includes(selected)) return { home: resolve(configured), source: 'environment' }
  if (inputs.allowInstalledHome === true) return { home: resolve(configured), source: 'installed' }
  return {
    home: laneHome,
    source: 'lane',
    notice: `desktop development: DSH_HOME=${configured} is the installed application's Harness home; `
      + `using ${laneHome} so this lane never shares its profile. Quit BirdCoder and set `
      + 'DSH_DESKTOP_DEV_INSTALLED_HOME=1 to target that home.',
  }
}

/**
 * Compare paths the way the filesystem does: one spelling on Windows, and a
 * link or junction resolves to the directory it names.
 * @param path - Path written by a user or inherited from an application.
 * @returns Comparable spelling of the same location.
 */
function canonicalPath(path: string): string {
  const absolute = resolve(path)
  const target = existsSync(absolute) ? realPath(absolute) : absolute
  return process.platform === 'win32' ? target.toLowerCase() : target
}

/**
 * Resolve one existing path to the directory it names.
 * @param path - Absolute path that exists.
 * @returns The link or junction target, or the path itself when it cannot be read.
 */
function realPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    // An unreadable path keeps its absolute spelling; comparison still holds.
    return path
  }
}
