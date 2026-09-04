/**
 * Fork slot services for the sdkwork /api carrier extras. The desktop shell's
 * BFF wiring (the privileged /api dispatch fallback and the two server-to-
 * browser WebSocket event downlinks) lives in
 * `@deepseek-ai/dsh-sdkwork-api-gateway`, which provides these services; this
 * host face consumes them through the slot so it keeps no compile-time
 * dependency on the apiProxy package — the upstream file-upload → connection
 * host reference would otherwise close a `tsc -b` project cycle through it.
 * @module @deepseek-ai/dsh-client-connection/sdkwork-gateway-slot
 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/** The /api dispatch fallback answering requests Connection's own routes decline. */
export interface SdkworkApiFallback {
  /**
   * Dispatch one request that fell through every Connection route.
   * @param request - the original request below the shared `/api` channel.
   * @returns the gateway's response.
   */
  fetch(request: Request): Promise<Response>
}

/**
 * The two server-to-browser event-stream upgrades, mounted on Connection's
 * authenticated `/api` channel: every upgrade still passes Connection's
 * Host/Origin trust fence before reaching these handlers.
 */
export interface SdkworkEventUpgrades {
  /**
   * Upgrade one socket onto the all-session mux event stream.
   * @param req - HTTP upgrade request.
   * @param socket - raw socket transferred by the HTTP server.
   * @param head - bytes already read after the upgrade headers.
   */
  handleMux(req: IncomingMessage, socket: Duplex, head: Buffer): void
  /**
   * Upgrade one socket onto the host-level event stream.
   * @param req - HTTP upgrade request.
   * @param socket - raw socket transferred by the HTTP server.
   * @param head - bytes already read after the upgrade headers.
   */
  handleHost(req: IncomingMessage, socket: Duplex, head: Buffer): void
  /**
   * Terminate owned sockets and await every frame pump.
   * @returns a promise resolving after every socket and source iterator stops.
   */
  close(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Provided by `@deepseek-ai/dsh-sdkwork-api-gateway` when mounted. */
    sdkworkApiFallback?: SdkworkApiFallback
    /** Provided by `@deepseek-ai/dsh-sdkwork-api-gateway` once apiProxy mounts. */
    sdkworkEventUpgrades?: SdkworkEventUpgrades
  }
}
