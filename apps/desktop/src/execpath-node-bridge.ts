/**
 * Desktop-only bridge between the Electron main process and helper processes
 * the harness spawns through `process.execPath`: under this shell execPath is
 * the GUI-subsystem Electron binary. Helpers run under the bundled plain-Node
 * binary when one is present (the web-identical runtime); otherwise
 * `ELECTRON_RUN_AS_NODE` makes the Electron binary execute the helper script
 * as plain Node. Without either, the windows-acl sandbox runner and dialog
 * workers boot as Electron apps and never exit, so every confined command
 * settles only at the sandbox timeout.
 *
 * The flag is injected per spawn, never into `process.env`: Chromium's own
 * children (GPU, network, utility) inherit the parent environment, so a
 * global assignment makes every one of them die at startup. Injection applies
 * only to JS-side `node:child_process` spawns of `process.execPath`, which is
 * exactly the harness's helper-spawn surface; under plain Node the flag is
 * inert, so the bridge changes nothing on a web launch.
 * @module @deepseek-ai/dsh-desktop/execpath-node-bridge
 */

import { createRequire } from 'node:module'
import type { SpawnOptions } from 'node:child_process'

const require = createRequire(import.meta.url)

/** The environment flag that runs the Electron binary as plain Node. */
export const EXECPATH_NODE_FLAG = 'ELECTRON_RUN_AS_NODE'

/** The spawn option surface the bridge touches: the caller's env plus any options it spreads through. */
type EnvCarryingOptions = SpawnOptions

/** The spawn option object with the bridge flag merged in. */
export type BridgedOptions = EnvCarryingOptions | undefined

/**
 * Resolve the spawn options for one child: keep the caller's options and env
 * untouched except for the bridge flag, which is added only when the spawned
 * program is this process's own executable and the caller did not already
 * set it.
 * @param file - the program being spawned.
 * @param options - the caller's spawn options (`undefined` when omitted).
 * @returns the options to hand to `node:child_process`.
 */
export function bridgeExecPathOptions(
  file: string,
  options: EnvCarryingOptions | undefined,
): BridgedOptions {
  if (file !== process.execPath) return options
  if (options === undefined) {
    return { env: { ...process.env, [EXECPATH_NODE_FLAG]: '1' } }
  }
  const env = options.env
  if (env !== undefined && EXECPATH_NODE_FLAG in env) return options
  return { ...options, env: { ...(env ?? process.env), [EXECPATH_NODE_FLAG]: '1' } }
}

/**
 * Resolve the program a helper runs under: helpers spawned through
 * `process.execPath` are rewritten to the bundled plain-Node binary when one
 * is available, so they execute exactly as under an npx/web launch. The
 * fallback (no bundled node) keeps `process.execPath` with the plain-Node
 * flag.
 * @param file - the program the harness asked to spawn.
 * @param resolveNode - resolves the bundled node binary (`undefined` when absent).
 * @returns the program to spawn.
 */
export function bridgeHelperProgram(file: string, resolveNode: () => string | undefined): string {
  if (file !== process.execPath) return file
  return resolveNode() ?? file
}

/**
 * Install the bridge: wrap the `node:child_process` spawn entry points so
 * every helper spawned through `process.execPath` runs under plain Node —
 * either the bundled binary (web-identical runtime) or this executable with
 * the plain-Node flag. Must run before the harness boots (it boots after this
 * module's caller). The patch is idempotent.
 * @param options - the bundled-node resolver.
 * @returns a disposer restoring the original functions.
 */
export function installExecPathNodeBridge(
  options: { resolveNode?: () => string | undefined } = {},
): () => void {
  const resolveNode = options.resolveNode ?? (() => undefined)
  const childProcess = require('node:child_process') as unknown as Record<string, unknown>
  const originals = new Map<string, unknown>()
  const wrapSpawn = (name: 'spawn' | 'spawnSync'): void => {
    const original = childProcess[name]
    if (typeof original !== 'function' || originals.has(name)) return
    originals.set(name, original)
    childProcess[name] = function (this: unknown, file: string, args: unknown, options: EnvCarryingOptions | undefined) {
      const program = bridgeHelperProgram(file, resolveNode)
      return (original as (...callArgs: unknown[]) => unknown).call(
        this, program, args, bridgeExecPathOptions(file, options),
      )
    }
  }
  wrapSpawn('spawn')
  wrapSpawn('spawnSync')
  return () => {
    for (const [name, original] of originals) childProcess[name] = original
    originals.clear()
  }
}
