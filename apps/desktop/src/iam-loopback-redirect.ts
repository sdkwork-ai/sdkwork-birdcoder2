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

import { createServer, type IncomingMessage, type Server } from 'node:http'
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

/**
 * Whether the request is the browser navigation the authorization server started.
 *
 * RFC 8252 section 7.3 treats the loopback listener as reachable by any local
 * caller, so the listener must reject requests no web redirect can produce. A
 * top-level navigation sends no `Origin`; a cross-origin `fetch`/`XMLHttpRequest`
 * always does, and Fetch Metadata marks it with a non-`navigate` mode. Rejecting
 * those keeps a malicious page from injecting callbacks (PKCE and state still
 * decide the outcome) and from using the listener as an oracle.
 * @param request - incoming loopback request.
 * @returns true only for a request shaped like a document navigation.
 */
function isBrowserNavigation(request: IncomingMessage): boolean {
  if (request.headers.origin !== undefined) return false
  const mode = request.headers['sec-fetch-mode']
  if (typeof mode === 'string' && mode !== 'navigate') return false
  const dest = request.headers['sec-fetch-dest']
  if (typeof dest === 'string' && dest !== 'document') return false
  return true
}

/** One process's loopback listener. */
export interface IamLoopbackRedirect {
  /** Start a listener and return the redirect URI to present as `redirect_uri`. */
  start(): Promise<{ redirectUri: string }>
  /**
   * The live listener's redirect URI while it waits, or null.
   *
   * A renderer reload destroys the page that started the login while the
   * listener keeps waiting; the next page adopts the same carrier from here so
   * a callback arriving after the reload still completes the persisted flow.
   */
  pending(): { redirectUri: string } | null
  /**
   * Take the last accepted callback the renderer has not consumed yet.
   *
   * A callback that arrives while the page is gone has no listener to hear the
   * event; the shell keeps the URL here for the reloaded page to redeem, then
   * forgets it so a code is never replayed by a later page.
   */
  takeCallback(): string | null
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
  let lastCallback: string | undefined

  /** Close the listener and timer; safe to call repeatedly. */
  const close = async (): Promise<void> => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    lastCallback = undefined
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
          || host !== expectedHost || !isBrowserNavigation(request) || !/[?&](code|error)=/u.test(url)) {
          response.writeHead(404, {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
            'x-content-type-options': 'nosniff',
          }).end()
          return
        }
        const callback = `http://${expectedHost}${url}`
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
          'x-content-type-options': 'nosniff',
        }).end(resultPage(brandName, request.headers['accept-language'] ?? '', isErrorCallback(callback)))
        // Keep listening: a local request with a forged state must not close the
        // real attempt. The renderer validates state/PKCE and stops the listener
        // when the login settles; the timeout is the backstop. The URL is kept
        // for a page that reloads before it can hear the event.
        lastCallback = callback
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
    pending() {
      return redirectUri === undefined || server === undefined ? null : { redirectUri }
    },
    takeCallback() {
      const value = lastCallback
      lastCallback = undefined
      return value ?? null
    },
  }
}
