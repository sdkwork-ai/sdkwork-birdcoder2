/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveBrand, shippedBrand } from './brand-manifest.mjs'

/**
 * Copy the platform launcher into the application's public command directory,
 * renamed and re-pointed for the selected brand.
 *
 * The shipped `cli/birdcoder` and `cli/birdcoder.cmd` files are the templates:
 * each names the installed executable once and defaults `DSH_HOME` to the
 * brand's home, so a CLI run from a terminal reads the same home as the shell.
 * A brand build rewrites both values and writes the result under its own command
 * name. Two installed brands then answer to two different commands and two
 * different homes, which is what keeps each one from replacing the other's PATH
 * entry or reading the other's sessions.
 * FORK DIVERGENCE (AGENTS.md, "Desktop application identity"): the installed
 * launcher answers to `birdcoder`, not upstream's `dsh`.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 * @param env - Packaging environment selecting the brand; defaults to `process.env`.
 */
export function prepareDesktopCli(
  destination: string,
  platform: 'darwin' | 'win32',
  env: Record<string, string | undefined> = process.env,
): void {
  const shipped = shippedBrand()
  const brand = resolveBrand(env)
  const suffix = platform === 'win32' ? '.cmd' : ''
  const template = readFileSync(join(import.meta.dirname, '..', 'cli', `${shipped.desktop.commandName}${suffix}`), 'utf8')
  const command = join(destination, 'bin', `${brand.desktop.commandName}${suffix}`)
  const home = platform === 'win32' ? `%USERPROFILE%\\${brand.home.dirName}` : `$HOME/${brand.home.dirName}`
  mkdirSync(join(destination, 'bin'), { recursive: true })
  writeFileSync(command, template
    .replaceAll(shipped.desktop.executableName, brand.desktop.executableName)
    .replaceAll('@BRAND_HOME@', home))
  if (platform === 'darwin') chmodSync(command, 0o755)
}
