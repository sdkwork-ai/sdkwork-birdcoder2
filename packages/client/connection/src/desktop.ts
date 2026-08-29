/**
 * Desktop carrier node half: provides the `desktopBridge` host service the
 * Electron main process wires to IPC. The web node half owns the
 * `connection` host service (its HTTP route and upgrade registrations are
 * inert over the desktop carrier); this row injects it and reuses its shared
 * fetch handler, so generic RPC channels, interceptors, and the privileged
 * pinning stay on the single HostConnectionService instance.
 * @module @deepseek-ai/dsh-client-connection/desktop
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type { HostFrame, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { API_PATH } from './api-path.ts'
import { createApiGatewayFetch } from './api-gateway.ts'
import { HostConnectionService } from './rpc-host.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-connection'

/** Service key under which the host bridge is provided. */
export const DESKTOP_BRIDGE_SERVICE = 'desktopBridge'

/** Structural view of the mounted Typert Gateway's stream carrier. */
interface TypertGatewayLike {
  readonly wireStream: {
    open(
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ): Promise<AsyncIterable<unknown>>
  }
}

/**
 * The host bridge surface the app's main process consumes: a fetch handler
 * for unary/respond, the two event-stream openers, and the Typert Gateway
 * Remote stream opener.
 */
export interface DesktopBridgeHost {
  /**
   * Dispatch one unary/respond request (loopback-shaped URL expected).
   * @param request - the Request to route through the shared /api handler.
   * @returns the RPC response body as a Response.
   */
  fetch(request: Request): Promise<Response>
  /** Open the all-session mux event stream (server→client frames). */
  openMux(signal: AbortSignal): AsyncIterable<RpcRequest<MuxFrame>>
  /** Open the host-level event stream (server→client frames). */
  openHost(signal: AbortSignal): AsyncIterable<RpcRequest<HostFrame>>
  /**
   * Open one Typert Remote stream through the mounted Gateway's carrier.
   * @param endpoint - Typert Remote stream endpoint (for example `session/control`).
   * @param payload - endpoint request encoded on the wire (`{ args }`).
   * @param signal - cancellation for this logical stream.
   * @returns Host items until completion, cancellation, or failure.
   */
  openStream(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): AsyncIterable<unknown>
}

/**
 * The desktop bridge service: owns the shared fetch handler and lazily reads
 * the apiProxy for the event streams (the gateway mounts after this row, so
 * streams open only once the tree settled — the app starts them post-boot).
 */
export class DesktopBridgeService extends Service implements DesktopBridgeHost {
  /**
   * @param ctx - owning desktop-connection plugin context.
   * @param fetchHandler - the shared /api fetch handler (unary + respond).
   */
  constructor(ctx: Context, private readonly fetchHandler: { fetch(request: Request): Promise<Response> }) {
    super(ctx, DESKTOP_BRIDGE_SERVICE)
  }

  fetch(request: Request): Promise<Response> {
    return this.fetchHandler.fetch(request)
  }

  openMux(signal: AbortSignal): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.openEventStream('mux', signal)
  }

  openHost(signal: AbortSignal): AsyncIterable<RpcRequest<HostFrame>> {
    return this.openEventStream('host', signal)
  }

  /**
   * Open one Typert Remote stream through the Gateway's shared wire stream.
   * @inheritdoc
   */
  async *openStream(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): AsyncGenerator<unknown> {
    const gateway = this.ctx.get('typertGateway') as TypertGatewayLike | undefined
    if (gateway === undefined) {
      throw new Error('desktop-connection: typertGateway service missing while opening a Remote stream')
    }
    yield* await gateway.wireStream.open(endpoint, payload, signal)
  }

  private openEventStream<F extends MuxFrame | HostFrame>(
    stream: 'mux' | 'host',
    signal: AbortSignal,
  ): AsyncIterable<RpcRequest<F>> {
    const api = this.ctx.get('apiProxy')
    if (api === undefined) {
      throw new Error('desktop-connection: apiProxy service missing while opening event stream')
    }
    const request = { rpcId: RpcId(randomUUID()), payload: {} }
    const frames = stream === 'mux' ? api.events.mux(request, signal) : api.events.host(request, signal)
    return frames as AsyncIterable<RpcRequest<F>>
  }
}

/**
 * Mount the desktop carrier: inject the `connection` host service (provided by
 * the web node half, whose HTTP registrations are inert over the desktop
 * carrier) and reuse its shared fetch handler for the IPC surface, then
 * provide the `desktopBridge` service the app wires to IPC.
 * @param ctx - plugin context.
 */
/** Required services: the shared Connection host service (the Typert Gateway is read lazily at stream-open time). */
export const inject = ['connection']

export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as HostConnectionService
  const sharedFetch = connection.createSharedFetchHandler(API_PATH)
  const gateway = createApiGatewayFetch(ctx)
  const fetchHandler = {
    async fetch(request: Request): Promise<Response> {
      const response = await sharedFetch.fetch(request)
      return response.status === 404 ? gateway.fetch(request) : response
    },
  }
  void new DesktopBridgeService(ctx, fetchHandler)
}
