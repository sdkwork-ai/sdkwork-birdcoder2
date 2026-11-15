/**
 * Loopback port preflight for the source Desktop launcher.
 *
 * A second `desktop:prod`/`desktop:dev` launch must not reuse the Host an
 * earlier window already published. The Electron single-instance lock focuses
 * that earlier window instead of starting a new Host, and the earlier Host keeps
 * serving the plugin snapshots it published at its own start — the new window
 * then renders the previous build (the symptom: "the new dialog is still the
 * old implementation"). Failing the launch before it builds or starts Electron
 * names the real cause instead of leaving that silent attachment.
 *
 * @module apps/desktop/scripts/development-ports
 */

import { createServer } from 'node:net'

/** Loopback host every development Host binds. */
const LOOPBACK_HOST = '127.0.0.1'

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

/** Probe face a launch test can replace without binding a real socket. */
export type DevelopmentPortProbe = (port: number) => Promise<boolean>

/** Inputs of {@link assertDevelopmentLanePortFree}. */
export interface DevelopmentLanePortOptions {
  /** Lane whose window would attach to the existing Host. */
  readonly lane: 'development' | 'online'
  /** Web port the lane binds. */
  readonly port: number
  /** Probe override for tests; defaults to {@link probeLoopbackPort}. */
  readonly probe?: DevelopmentPortProbe
}

/**
 * Reject a launch that would silently attach to an already-running lane.
 * @param options - the lane, its web port, and an optional probe.
 * @returns nothing when the port is free.
 * @throws When another process already serves the lane's web port.
 */
export async function assertDevelopmentLanePortFree(options: DevelopmentLanePortOptions): Promise<void> {
  const probe = options.probe ?? probeLoopbackPort
  if (await probe(options.port)) {
    throw new Error(
      `desktop development: the ${options.lane} lane web port ${options.port} is already in use by another BirdCoder instance; `
      + 'quit that window (and any other launched lane) and start again, otherwise this launch attaches to the older Host '
      + 'and renders the plugin build it published when it started',
    )
  }
}
