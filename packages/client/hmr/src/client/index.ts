/** Web SSE transport for page-owned client entry reconciliation and rebuilt code replacement. */
import type { Context } from '@deepseek-ai/cordis'
import type { PluginsEventParseResult } from '../events.ts'
import { EVENTS_ROUTE, parsePluginsEventFrame } from '../events.ts'
import type { EventStreamFetch } from './transport.ts'
import { eventStreamFetch, followEventStream } from './transport.ts'

export type { PluginsEventFrame } from '../events.ts'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required service: the client module system whose entry controller handles received frames. */
export const inject = ['modules']

/** Page global carrying the shell transport; absent in the served web app. */
interface PageTransportGlobal {
  __DSH_TRANSPORT__?: { fetch?: EventStreamFetch }
}

/**
 * Forward graph snapshots and rebuilds to the page's shared serial controller.
 * The stream arrives through the shell transport when the page has one, through
 * fetch on a custom document scheme (`dsh-app://` cannot open an `EventSource`),
 * and otherwise through the browser `EventSource`.
 * @param ctx - Plugin context with the client module system.
 */
export function apply(ctx: Context): void {
  const entries = ctx.modules.entries
  const handle = (frame: Extract<PluginsEventParseResult, { kind: 'frame' }>['frame']): void => {
    const run = frame.type === 'graph'
      ? Promise.resolve().then(() => entries.sync(frame.graph))
      : entries.reload(frame.id, frame.rev)
    void run.catch((error: unknown) => { ctx.logger.error(error) })
  }
  const receive = (data: string): void => {
    let value: unknown
    try {
      value = JSON.parse(data)
    } catch {
      // Wire boundary: a malformed transport frame is dropped loudly.
      ctx.logger.warn(`client-hmr: unparseable event frame: ${data}`)
      return
    }
    const parsed = parsePluginsEventFrame(value)
    if (parsed.kind === 'invalid') {
      ctx.logger.warn(`client-hmr: invalid event frame: ${data}`)
    } else if (parsed.kind === 'frame') {
      handle(parsed.frame)
    }
  }

  ctx.effect(() => {
    const controller = new AbortController()
    const transport = (globalThis as PageTransportGlobal).__DSH_TRANSPORT__
    const stream = transport?.fetch ?? eventStreamFetch(
      typeof location === 'undefined' ? undefined : location.protocol,
      (input, init) => fetch(input, init),
    )
    if (stream !== undefined) {
      void followEventStream(stream, controller.signal, receive, (error: unknown) => {
        if (!controller.signal.aborted) ctx.logger.error(error)
      })
      return () => { controller.abort() }
    }
    const source = new EventSource(EVENTS_ROUTE)
    source.addEventListener('message', (event: MessageEvent<string>) => { receive(event.data) })
    return () => { source.close() }
  }, 'client-hmr: event source')
}
