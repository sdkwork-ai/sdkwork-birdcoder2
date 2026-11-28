/**
 * Loopback port preflight for the source Desktop launcher.
 *
 * A second `desktop:prod`/`desktop:dev` launch must not reuse the Host an
 * earlier window already published. The Electron single-instance lock focuses
 * that earlier window instead of starting a new Host, and the earlier Host keeps
 * serving the plugin snapshots it published at its own start — the new window
 * then renders the previous build (the symptom: "the new dialog is still the
 * old implementation"). {@link ./development-lane-instance.ts} replaces the
 * window this launcher started itself; this module owns the probe and the
 * failure a port held by any other process produces.
 *
 * @module apps/desktop/scripts/development-ports
 */

import { createServer } from 'node:net'

/** Loopback host every development Host binds. */
const LOOPBACK_HOST = '127.0.0.1'

/** Source Desktop lane one launch belongs to. */
export type DevelopmentLane = 'development' | 'online'

/**
 * Probe whether a loopback TCP port is already served.
 * @param port - the candidate TCP port.
 * @returns whether another process currently listens on it.
 * @throws When the probe itself fails for a reason other than `EADDRINUSE`.
 */
export async function probeLoopbackPort(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(true)
        return
      }
      reject(error)
    })
    server.once('listening', () => {
      server.close(() => { resolve(false) })
    })
    server.listen({ port, host: LOOPBACK_HOST, exclusive: true })
  })
}

/**
 * Describe a lane port held by a process this launch does not own.
 * @param lane - lane whose Web port is taken.
 * @param port - the taken TCP port.
 * @returns the error the launch fails with.
 */
export function lanePortInUseError(lane: DevelopmentLane, port: number): Error {
  return new Error(
    `desktop development: the ${lane} lane web port ${port} is already in use by a process this launch does not own; `
    + 'quit it and start again, otherwise this launch attaches to the older Host and renders the plugin build it '
    + 'published when it started',
  )
}
