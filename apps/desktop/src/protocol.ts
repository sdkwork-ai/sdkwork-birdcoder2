/**
 * The app:// protocol: serves the built web frontend and plugin bundles
 * through the desktop carrier's route tables — the desktop analogue of the
 * web carrier's HTTP server, driven by Electron's protocol handler.
 * @module @deepseek-ai/dsh-desktop/protocol
 */

import { protocol } from 'electron'
import type { DesktopWebServer } from '@deepseek-ai/dsh-sdkwork-desktop-carrier'

/** The custom scheme the desktop shell loads the frontend from. */
const APP_SCHEME = 'app'

/** The only hostname the shell serves (the renderer's origin is `app://dsh`). */
const APP_HOST = 'dsh'

/** The loader entry URL of the frontend shell. */
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

/**
 * Register the scheme as privileged before app readiness: standard (proper
 * origin, relative resolution), secure, fetch-capable, CORS-enabled, and
 * streamable — the renderer fetches plugin bundles and assets over it.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }])
}

/**
 * Handle app:// requests through the desktop carrier's dispatch. Any hostname
 * other than {@link APP_HOST} is refused: the shell serves exactly one origin.
 * @param carrier - the booted desktop carrier service.
 */
export function registerDesktopProtocol(carrier: DesktopWebServer): void {
  protocol.handle(APP_SCHEME, (request) => {
    let hostname: string
    try {
      hostname = new URL(request.url).hostname
    } catch {
      return new Response(null, { status: 400 })
    }
    if (hostname !== APP_HOST) return new Response(null, { status: 404 })
    return carrier.dispatch(request)
  })
}
