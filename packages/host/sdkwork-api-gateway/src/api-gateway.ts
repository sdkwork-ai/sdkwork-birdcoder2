/**
 * The shared /api dispatch fallback: privileged-method pinning plus the
 * apiProxy gateway, identical for the web and desktop carriers so both
 * surfaces enforce the same boundary. The 426 upgrade-required answer for the
 * event paths is web-carriage specific and stays in the web node half.
 * @module @deepseek-ai/dsh-client-connection/api-gateway
 */

import type { Context } from '@deepseek-ai/cordis'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import { isTrustedApiRequest } from '@deepseek-ai/dsh-client-connection/src/api-request-trust.ts'
import { API_PATH } from '@deepseek-ai/dsh-client-connection/src/api-path.ts'
import type { SdkworkApiFallback } from '@deepseek-ai/dsh-client-connection/src/sdkwork-gateway-slot.ts'
import { PRIVILEGED_METHODS } from './privileged-methods.ts'

/**
 * Compose the dispatch fallback for one host context: method extraction from
 * the /api pathname, loopback pinning of {@link PRIVILEGED_METHODS}, and
 * delegation to the mounted apiProxy gateway (404 when no gateway exists).
 * @param ctx - host plugin context carrying the apiProxy service.
 * @returns the fallback fetch handler.
 */
export function createApiGatewayFetch(ctx: Context): SdkworkApiFallback {
  return {
    fetch(request: Request): Promise<Response> {
      const pathname = new URL(request.url).pathname
      const method = pathname.startsWith(`${API_PATH}/`)
        ? pathname.slice(API_PATH.length + 1)
        : undefined
      if (method !== undefined
        && PRIVILEGED_METHODS.has(method)
        && !isTrustedApiRequest(request, [])) {
        return Promise.resolve(new Response('forbidden', { status: 403 }))
      }
      const apiProxy = ctx.get('apiProxy')
      if (apiProxy === undefined) return Promise.resolve(new Response('not found', { status: 404 }))
      return toFetchHandler(apiProxy).fetch(request)
    },
  }
}
