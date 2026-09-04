/**
 * Sdkwork /api carrier extras, node half: provides the two slot services the
 * connection host face consumes without a compile-time dependency on the
 * apiProxy package — the privileged /api dispatch fallback over the mounted
 * apiProxy, and the two server-to-browser WebSocket event downlinks. The web
 * composition mounts this row beside Connection whenever apiProxy is present;
 * without apiProxy the fallback answers 404 and the downlink slot never
 * resolves, exactly like the pre-slot wiring it replaces.
 * @module @deepseek-ai/dsh-sdkwork-api-gateway
 */

import type { Context } from '@deepseek-ai/cordis'
import { createApiGatewayFetch } from './api-gateway.ts'
import { WebSocketDownlinks } from './websocket-downlink.ts'

/** Stable Cordis plugin name. */
export const name = 'sdkwork-api-gateway'

/**
 * Plugin body: provide the /api fallback immediately (it reads the apiProxy
 * lazily per request) and the event-upgrade handlers once apiProxy mounts.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.provide('sdkworkApiFallback', createApiGatewayFetch(ctx))

  ctx.inject(['apiProxy'], (apiCtx) => {
    const downlinks = new WebSocketDownlinks(apiCtx.apiProxy)
    apiCtx.effect(() => () => { void downlinks.close() }, 'sdkwork-api-gateway: WebSocket downlinks')
    ctx.provide('sdkworkEventUpgrades', {
      handleMux: (req, socket, head) => { downlinks.handleMux(req, socket, head) },
      handleHost: (req, socket, head) => { downlinks.handleHost(req, socket, head) },
      close: () => downlinks.close(),
    })
  })
}
