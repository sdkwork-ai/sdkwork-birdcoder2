/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-sdkwork-desktop-carrier`.
 * @module @deepseek-ai/dsh-sdkwork-desktop-carrier/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-sdkwork-desktop-carrier'

/** Cordis companion plugin name. */
export const name = 'host-desktop-carrier-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Owned relation: a registered route must answer its path through
 * {@link DesktopWebServer.dispatch} and stop answering after its disposer
 * runs — the desktop analogue of the web carrier's route-table symmetry.
 * Checked on every fiber teardown (cordis 'internal/plugin'): a probe route is
 * registered, dispatched (200 expected), disposed, and dispatched again (404
 * expected, proving the entry left the table and no fallback answered).
 */
const install: InvariantInstaller = (ctx, fail) => {
  ctx.on('internal/plugin', () => {
    type ProbeResponse = { writeHead(status: number): void; end(body?: unknown): void }
    const server = ctx.get('webServer') as
      | {
        register(route: { kind: 'exact'; path: string; handler: (req: { url?: string }, res: ProbeResponse) => void }): () => void
        dispatch(request: { url: string }): Promise<{ status: number }>
      }
      | undefined
    if (server?.dispatch === undefined) return // no desktop carrier in this composition
    const route = {
      kind: 'exact' as const,
      path: '/__dsh_desktop_invariant_probe__',
      handler: (_req: { url?: string }, res: ProbeResponse): void => { res.writeHead(200); res.end('probe') },
    }
    try {
      const dispose = server.register(route)
      let first: { status: number } | undefined
      void server.dispatch({ url: 'http://dsh.internal/__dsh_desktop_invariant_probe__' })
        .then((result) => {
          first = result
          dispose()
          return server.dispatch({ url: 'http://dsh.internal/__dsh_desktop_invariant_probe__' })
        })
        .then((second) => {
          if (first?.status !== 200 || second.status !== 404) {
            fail('desktop carrier dispatch left a disposed route answering — route table and fiber lifecycles diverged')
          }
        })
        .catch(() => {
          fail('desktop carrier dispatch failed on the probe route')
        })
    } catch {
      fail('desktop carrier register threw on the probe route — route registrations are broken')
    }
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
