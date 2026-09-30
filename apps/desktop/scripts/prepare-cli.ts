/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_CLI_COMMAND_NAME } from './desktop-application-identity.mjs'

/**
 * Copy the platform launcher into the application's public command directory.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 * FORK DIVERGENCE (AGENTS.md, "Desktop application identity"): the installed
 * launcher answers to `birdcoder`, not upstream's `dsh`. Both applications
 * register their launcher on the same PATH, so a shared command name makes each
 * one answer for the other.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32'): void {
  const name = platform === 'win32' ? `${DESKTOP_CLI_COMMAND_NAME}.cmd` : DESKTOP_CLI_COMMAND_NAME
  const command = join(destination, 'bin', name)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  copyFileSync(join(import.meta.dirname, '..', 'cli', name), command)
  if (platform === 'darwin') chmodSync(command, 0o755)
}
