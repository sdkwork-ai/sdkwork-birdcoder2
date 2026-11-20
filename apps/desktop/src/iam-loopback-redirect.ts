/**
 * RFC 8252 loopback redirect for the desktop browser login.
 *
 * The hosted IAM authorize page can return the authorization code to a
 * loopback URI (`http://127.0.0.1:<ephemeral-port>/auth/callback`) instead of
 * a custom scheme. Each Desktop process binds its own port, so the callback
 * necessarily reaches the process that started the login — no operating-system
 * scheme association, no cross-process forwarding, no spool. PKCE and state
 * validation continue in the IAM desktop-auth runtime; this server only
 * transports the callback URL.
 *
 * Only one login can wait per process; starting a second attempt closes the
 * first listener. The listener binds loopback, accepts only `GET` on the exact
 * callback path, checks the `Host` header against DNS rebinding, answers with a
 * self-contained page, and closes after the first accepted callback (an
 * authorization code is single-use). The callback is handed to the shell as
 * soon as it is accepted.
 *
 * @module iam-loopback-redirect
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** Path the IAM OAuth client registers for the desktop loopback redirect. */
export const IAM_LOOPBACK_CALLBACK_PATH = '/auth/callback'

/** Default time a listener waits for the browser; mirrors the login window. */
export const IAM_LOOPBACK_TIMEOUT_MS = 5 * 60_000

/** Minimal success page; no scripts, no external references, no secrets. */
const DEFAULT_BRAND_NAME = 'BirdCoder'

/** Options of {@link createIamLoopbackRedirect}. */
export interface IamLoopbackRedirectOptions {
  /** Receives every accepted callback URL. */
  onCallback: (url: string) => void
  /** Product name the success page shows. */
  brandName?: string
  /** Wait bound; defaults to {@link IAM_LOOPBACK_TIMEOUT_MS}. */
  timeoutMs?: number
}

/** Render the brand-and-locale result page; no scripts or external references. */
function resultPage(brandName: string, acceptLanguage: string, failed: boolean): string {
  const chinese = acceptLanguage.trim().toLowerCase().startsWith('zh')
  const brand = brandName.replace(/[&<>"']/gu, character => `&#${String(character.charCodeAt(0))};`)
  const title = failed
    ? (chinese ? '登录未完成' : 'Sign-in not completed')
    : (chinese ? '登录完成' : 'Signed in')
  const line = failed
    ? (chinese
      ? `${brand}：登录未完成。请返回应用重试。`
      : `${brand}: sign-in was not completed. Return to the app and try again.`)
    : (chinese
      ? `${brand}：登录已完成。可以关闭此标签页并返回应用。`
      : `${brand}: sign-in complete. You can close this tab and return to the app.`)
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>`
    + '<meta name="referrer" content="no-referrer">'
    + '<style>body{font:16px system-ui;margin:4rem;color:#222}</style></head>'
    + `<body><p>${line}</p></body></html>`
}

/** Whether one callback URL carries an OAuth error instead of a code. */
function isErrorCallback(url: string): boolean {
  try {
    return new URL(url).searchParams.has('error')
  } catch {
    return false
  }
}

/** One process's loopback listener. */
export interface IamLoopbackRedirect {
  /** Start a listener and return the redirect URI to present as `redirect_uri`. */
  start(): Promise<{ redirectUri: string }>
  /** Stop waiting without a callback. */
  cancel(): Promise<void>
  /** Stop waiting and release the port without throwing. */
  dispose(): Promise<void>
}

/** Parse the callback path from one request URL without trusting the Host. */
function callbackPathOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    return new URL(url, 'http://127.0.0.1').pathname
  } catch {
    return undefined
  }
}

/**
 * Create the loopback listener. It is inert until {@link IamLoopbackRedirect.start}.
 * @param options - callback sink and wait bound.
 * @returns the listener handle.
 */
export function createIamLoopbackRedirect(options: IamLoopbackRedirectOptions): IamLoopbackRedirect {
  const timeoutMs = options.timeoutMs ?? IAM_LOOPBACK_TIMEOUT_MS
  const brandName = options.brandName ?? DEFAULT_BRAND_NAME
  let server: Server | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let redirectUri: string | undefined

  /** Close the listener and timer; safe to call repeatedly. */
  const close = async (): Promise<void> => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    const current = server
    server = undefined
    if (current !== undefined) {
      current.closeAllConnections()
      await new Promise<void>((resolve) => { current.close(() => { resolve() }) })
    }
  }

  return {
    async start() {
      await close()
      redirectUri = undefined
      const listener = createServer((request, response) => {
        const url = request.url
        const host = request.headers.host ?? ''
        const path = callbackPathOf(url)
        const expectedHost = redirectUri === undefined ? '' : new URL(redirectUri).host
        if (url === undefined || request.method !== 'GET' || path !== IAM_LOOPBACK_CALLBACK_PATH
          || host !== expectedHost || !/[?&](code|error)=/u.test(url)) {
          response.writeHead(404, { 'cache-control': 'no-store' }).end()
          return
        }
        const callback = `http://${expectedHost}${url}`
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
        }).end(resultPage(brandName, request.headers['accept-language'] ?? '', isErrorCallback(callback)))
        // Keep listening: a local request with a forged state must not close the
        // real attempt. The renderer validates state/PKCE and stops the listener
        // when the login settles; the timeout is the backstop.
        options.onCallback(callback)
      })
      server = listener
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject)
        listener.listen(0, '127.0.0.1', () => { resolve() })
      })
      const address = listener.address() as AddressInfo | null
      if (address === null || typeof address.port !== 'number') {
        await close()
        throw new Error('loopback redirect has no port')
      }
      listener.on('error', (error: Error) => {
        console.warn('[iam-loopback] listener error:', error.message)
        void close()
      })
      redirectUri = `http://127.0.0.1:${String(address.port)}${IAM_LOOPBACK_CALLBACK_PATH}`
      timer = setTimeout(() => {
        timer = undefined
        void close()
      }, timeoutMs)
      return { redirectUri }
    },
    async cancel() {
      await close()
    },
    async dispose() {
      await close()
    },
  }
}
