/**
 * Desktop browser-login adapter for SDKWork IAM: the hosted
 * `platform.birdcoder.com` authorization page returns through the registered
 * deep-link callback (shipped default `birdcoder://auth/callback`), and the
 * code is redeemed through the generated app SDK's
 * `oauth.desktopSessions.create`.
 *
 * The deep-link bridge is the upstream `sdkworkDesktop` preload shape
 * (`deepLinks` / `shellOpen`); this module validates it before use so a page
 * without the preload bridge (plain Web) reports browser login unavailable.
 *
 * The redeem leg is at-most-once, unlike every other generated operation: an
 * authorization code is single-use, so a retried or duplicated POST can only be
 * rejected after the first one consumed the code, and the browser login then
 * reports a failed exchange for a code that was valid.
 */

import { createSdkworkIamDesktopAuthRuntime, DEFAULT_DESKTOP_LOGIN_SCOPES, type SdkworkDesktopAuthHostPort, type SdkworkDesktopAuthSession, type SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'
import { appApiPath, createClient, type SdkworkAppClient } from '@sdkwork/iam-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import { readServerFailureResponse, type IamServerFailureResponse } from './iam-server-failure.ts'

/** Path of the generated desktop-session redeem operation. */
const DESKTOP_SESSION_REDEEM_PATH = appApiPath('/oauth/desktop_sessions')

/** Path of the anonymous authorization bootstrap the hosted page calls first. */
const AUTHORIZATION_BOOTSTRAP_PATH = appApiPath('/oauth/authorizations')

/** The generated-client slice the desktop auth runtime binds for its redeem leg. */
type RedeemSdkClient = Parameters<typeof createSdkworkIamDesktopAuthRuntime>[0]['appSdkClient']

/**
 * Whether a failure means the hosted page could not start the authorization.
 *
 * The hosted page answers the app with `provider-denied` / `server_error`
 * whenever its own bootstrap call was rejected. The code pair is read
 * structurally for the same reason as the callback codes: the generated
 * bundles can inline their own copy of the auth package, so class identity is
 * not a contract.
 * @param error - the failure the runtime reported.
 * @returns true when the hosted page itself failed to start the authorization.
 */
function isHostedAuthorizationStartFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, detail } = error as { code?: unknown; detail?: unknown }
  return code === 'provider-denied' && detail === 'server_error'
}

/**
 * Bind the redeem leg to the generated transport with at-most-once delivery.
 *
 * The generated transport retries a request up to three times on transport
 * failures and 5xx responses. Both are exactly the cases where the server may
 * already have consumed the code, so the retry can only return "code invalid or
 * expired" while the first attempt succeeded 鈥?and a browser hand-off that
 * auto-fires and a user clicking its link can submit the same code twice.
 * One request per code makes both harmless: the second delivery observes the
 * first one's outcome instead of redeeming again. Recovery from a genuinely
 * failed redeem is the card's retry, which starts a fresh browser login.
 * @param client - generated app client carrying the shared token manager.
 * @param onServerFailure - receives the server's own report when the redeem is
 * rejected; the runtime only keeps the message, so the details view would
 * otherwise lose the status, code, trace id, and problem document.
 * @returns the client slice the desktop runtime redeems through.
 */
function createAtMostOnceRedeemClient(
  client: SdkworkAppClient,
  onServerFailure: (response: IamServerFailureResponse) => void,
): RedeemSdkClient {
  let attempted: { code: unknown; result: Promise<unknown> } | undefined
  return {
    oauth: {
      desktopSessions: {
        create: (command?: unknown) => {
          const body = command as Record<string, unknown>
          const code = body.authorizationCode
          if (attempted !== undefined && attempted.code === code) return attempted.result
          const requested = client.http.request<unknown>(DESKTOP_SESSION_REDEEM_PATH, {
            method: 'POST',
            contentType: 'application/json',
            skipAuth: true,
            // The V3 create envelope nests the session under `data.item`
            // (`{"code":0,"data":{"item":{...}}}`), exactly like the generated
            // `oauth.desktopSessions.create` this call replaces. Asking for
            // `data` would hand `{ item: session }` to the session validator,
            // which then rejects a successful redeem as an incomplete session.
            sdkworkUnwrapKind: 'item',
            retry: { maxRetries: 0 },
            body,
          })
          const result = requested.catch((error: unknown) => {
            // A rejected redeem is a server-answered step whenever the request
            // reached the API; keep that answer before the runtime reduces it
            // to a message.
            const response = readServerFailureResponse(error)
            if (response !== undefined) onServerFailure(response)
            throw error
          })
          attempted = { code, result }
          return result
        },
      },
    },
  }
}

/**
 * How often a waiting desktop login asks the shell for a callback it may have
 * missed.
 *
 * The shell delivers a running login's callback as an event on the window's
 * preload bridge, and an event has no backlog: a callback that arrives while
 * the renderer that owns the pending flow has no listener (the document is
 * reloading, the plugin has not bootstrapped yet, or the listener was released
 * with a previous runtime) is dropped, and the attempt then waits until its
 * deadline even though the shell is holding the URL. The shell keeps the last
 * accepted callback for `getInitialUrl`, so the waiting flow polls that take
 * to recover it. The interval stays well under the flow deadline, and each take
 * returns null after the first delivery.
 */
const PENDING_CALLBACK_POLL_MS = 2_000

/** The preload global the desktop shell exposes. */
interface SdkworkDesktopGlobal {
  readonly sdkworkDesktop?: unknown
}

/** Loopback redirect controls the desktop shell exposes next to the bridge. */
export interface SdkworkDesktopLoopbackPort {
  /** Start a listener and return the per-process redirect URI. */
  start(): Promise<{ redirectUri: string }>
  /** The live listener's redirect URI, or null when none waits. */
  pending?(): Promise<{ redirectUri: string } | null>
  /** Take a callback accepted while no page could hear it, or null. */
  takeCallback?(): Promise<string | null>
  /** Stop the pending listener. */
  cancel(): Promise<void>
  /** Subscribe to accepted callback URLs; returns the unsubscribe function. */
  onCallback(handler: (url: string) => void): () => void
}

/**
 * The upstream bridge plus this fork's loopback extension.
 *
 * A loopback redirect needs no operating-system scheme association, so it is
 * the preferred callback when the shell offers it and the IAM client allows
 * `http://127.0.0.1:<port>` redirects. The custom-scheme `deepLinks` bridge
 * remains the fallback and the source of cold-start callbacks.
 */
export interface SdkworkDesktopBridge extends SdkworkDesktopBridgeShape {
  /** Present when the shell can host a loopback login listener. */
  loopbackLogin?: SdkworkDesktopLoopbackPort
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the standard `sdkworkDesktop` bridge from the page.
 * @returns the validated bridge, or undefined outside the desktop shell.
 */
export function readSdkworkDesktopBridge(): SdkworkDesktopBridge | undefined {
  const candidate = (globalThis as SdkworkDesktopGlobal).sdkworkDesktop
  if (!isRecord(candidate)) return undefined
  const deepLinks = candidate.deepLinks
  const shellOpen = candidate.shellOpen
  if (!isRecord(deepLinks) || !isRecord(shellOpen)) return undefined
  const { getInitialUrl, onOpenUrl } = deepLinks
  const { open } = shellOpen
  if (typeof getInitialUrl !== 'function' || typeof onOpenUrl !== 'function' || typeof open !== 'function') {
    return undefined
  }
  // The page global is foreign input, so each exposed method binds the
  // validated function to the object that owned it and narrows its result
  // here rather than trusting the bridge's declared types.
  const bridge: SdkworkDesktopBridge = {
    deepLinks: {
      getInitialUrl: async () => {
        const value: unknown = await Reflect.apply(getInitialUrl, deepLinks, [])
        return typeof value === 'string' ? value : null
      },
      onOpenUrl: (handler) => {
        const value: unknown = Reflect.apply(onOpenUrl, deepLinks, [handler])
        return typeof value === 'function' ? value as () => void : () => {}
      },
    },
    shellOpen: {
      open: async (url) => {
        await Reflect.apply(open, shellOpen, [url])
      },
    },
  }
  const loopback = candidate.loopbackLogin
  if (isRecord(loopback)) {
    const { start, cancel, onCallback, pending, takeCallback } = loopback
    if (typeof start === 'function' && typeof cancel === 'function' && typeof onCallback === 'function') {
      bridge.loopbackLogin = {
        start: async () => {
          const value: unknown = await Reflect.apply(start, loopback, [])
          if (!isRecord(value) || typeof value.redirectUri !== 'string') {
            throw new Error('loopback login returned no redirect URI')
          }
          return { redirectUri: value.redirectUri }
        },
        cancel: async () => { await Reflect.apply(cancel, loopback, []) },
        onCallback: (handler) => {
          const value: unknown = Reflect.apply(onCallback, loopback, [handler])
          return typeof value === 'function' ? value as () => void : () => {}
        },
        // The resume reads are optional: a shell from before they ship simply
        // cannot adopt a carrier across a reload.
        ...(typeof pending === 'function'
          ? {
            pending: async (): Promise<{ redirectUri: string } | null> => {
              const value: unknown = await Reflect.apply(pending, loopback, [])
              return isRecord(value) && typeof value.redirectUri === 'string' && value.redirectUri !== ''
                ? { redirectUri: value.redirectUri }
                : null
            },
          }
          : {}),
        ...(typeof takeCallback === 'function'
          ? {
            takeCallback: async (): Promise<string | null> => {
              const value: unknown = await Reflect.apply(takeCallback, loopback, [])
              return typeof value === 'string' && value !== '' ? value : null
            },
          }
          : {}),
      }
    }
  }
  return bridge
}

/**
 * The durable session port the desktop shell exposes next to the login bridge.
 *
 * The bridge writes the committed session into the Harness home
 * (`<DSH_HOME>/iam/session.json`), so the Host and headless callers read the
 * same complete session the renderer holds.
 */
export interface SdkworkDesktopIamSessionPort {
  /** Read the durable session record (validated by the token store). */
  read(): Promise<unknown>
  /** Persist one complete dual-token session. */
  save(session: unknown): Promise<void>
  /** Remove the durable session. */
  clear(): Promise<void>
}

/**
 * Read the durable-session slice of the `sdkworkDesktop` bridge.
 * @returns the validated port, or undefined outside the desktop shell.
 */
export function readSdkworkDesktopIamSessionBridge(): SdkworkDesktopIamSessionPort | undefined {
  const candidate = (globalThis as SdkworkDesktopGlobal).sdkworkDesktop
  if (!isRecord(candidate)) return undefined
  const session = candidate.iamSession
  if (!isRecord(session)) return undefined
  const { read, save, clear } = session
  if (typeof read !== 'function' || typeof save !== 'function' || typeof clear !== 'function') return undefined
  // The page global is foreign input: bind each method to the object that
  // exposed it and let the transport result stay unvalidated here.
  return {
    read: async () => await Reflect.apply(read, session, []),
    save: async (value) => { await Reflect.apply(save, session, [value]) },
    clear: async () => { await Reflect.apply(clear, session, []) },
  }
}

/** Identity, origins, and sinks the desktop browser-login flow needs. */
export interface CreateIamDesktopLoginOptions {
  /** OAuth client id the hosted authorization receives as `client_id`. */
  clientId: string
  /**
   * Registered deep-link callback used when the shell offers no loopback
   * listener (or the loopback listener cannot start).
   */
  redirectUri: string
  /** Hosted IAM authorization origin, e.g. `https://platform.birdcoder.com`. */
  authorizeBaseUrl: string
  /** IAM app-api origin used for the desktop-session exchange. */
  baseUrl: string
  tokenManager: AuthTokenManager
  bridge: SdkworkDesktopBridge
  /** Stable opaque per-install device identity used to scope the session. */
  deviceId?: string
  /** Deadline of the pending flow; defaults to the desktop runtime's own window. */
  flowTtlMs?: number
  /** Commit the redeemed dual-token session into the product auth runtime. */
  onSession: (session: SdkworkDesktopAuthSession) => void | Promise<void>
  onError?: (error: unknown) => void
  /**
   * Receives the server's own report for a rejected redeem.
   *
   * The desktop auth runtime wraps a failed exchange into one message, so the
   * card's details view needs this sink to show the HTTP status, wire code,
   * trace id, and problem document the IAM endpoint answered with.
   */
  onServerFailure?: (response: IamServerFailureResponse) => void
}

/** The renderer-facing desktop login controls. */
export interface IamDesktopLogin {
  begin(): Promise<void>
  cancel(): Promise<void>
  isWaiting(): boolean
  /**
   * Adopt the loopback carrier a previous page started, and take a callback the
   * shell accepted while no page could hear it.
   *
   * A renderer reload destroys the page that began the login while the shell's
   * listener keeps waiting; the persisted PKCE flow still describes that
   * carrier, so the reloaded page builds its runtime around it instead of
   * failing the attempt.
   * @returns whether a waiting loopback listener was adopted.
   */
  resumePendingLoopback(): Promise<boolean>
  /**
   * The hosted authorize URL of the waiting attempt, once the browser hand-off
   * started. Present only while the flow waits: a settled attempt's URL carries
   * a spent or expired state and must not be offered for manual opening.
   * @returns the authorize URL, or undefined when no attempt is waiting.
   */
  authorizeUrl(): string | undefined
  subscribe(listener: () => void): () => void
  completePendingCallbackFromLaunch(): Promise<boolean>
  dispose(): void
}

/**
 * Build the desktop browser-login flow over the standard preload bridge.
 *
 * When the shell exposes a loopback listener, each attempt starts a fresh
 * RFC 8252 redirect (`http://127.0.0.1:<port>/auth/callback`) and builds a
 * runtime around that URI; the loopback callback and any fallback deep link
 * both feed the same state/PKCE validation. Without a listener the flow keeps
 * the registered custom-scheme callback unchanged.
 * @param options - identity, origins, token manager, bridge, and session sink.
 * @returns the flow controls the IAM service drives.
 */
export function createIamDesktopLogin(options: CreateIamDesktopLoginOptions): IamDesktopLogin {
  const client = createClient({
    authMode: 'dual-token',
    baseUrl: options.baseUrl,
    platform: 'pc',
    tokenManager: options.tokenManager,
  })
  type Runtime = ReturnType<typeof createSdkworkIamDesktopAuthRuntime>
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  /** The authorize URL last handed to the system browser, for the waiting card. */
  let authorizeUrl: string | undefined
  /**
   * Hand one authorize URL to the system browser.
   *
   * The URL is captured here because it is the only place the flow holds it:
   * the runtime's `beginLogin` resolves without it, while this host call is the
   * exact request the browser receives 鈥?so the card can offer the same page
   * when the browser reports success without showing a window.
   */
  const openAuthorizePage = async (url: string): Promise<void> => {
    authorizeUrl = url
    await options.bridge.shellOpen.open(url)
  }
  const standardHost: SdkworkDesktopAuthHostPort = {
    id: 'electron',
    async getInitialUrl() {
      return options.bridge.deepLinks.getInitialUrl()
    },
    onOpenUrl(handler) {
      return options.bridge.deepLinks.onOpenUrl(handler)
    },
    openExternal: openAuthorizePage,
  }
  const loopbackHost = (port: SdkworkDesktopLoopbackPort): SdkworkDesktopAuthHostPort => ({
    // A custom native host: the same Electron shell, with a per-attempt
    // loopback carrier instead of the OS scheme association. `custom` is the
    // portable id the auth package defines for exactly this case.
    id: 'custom',
    async getInitialUrl() {
      // A loopback callback cannot arrive before this runtime exists: the
      // listener is started first and the browser opens only afterwards.
      return null
    },
    onOpenUrl(handler) {
      const offLoopback = port.onCallback(handler)
      const offDeepLinks = options.bridge.deepLinks.onOpenUrl(handler)
      return () => {
        offLoopback()
        offDeepLinks()
      }
    },
    openExternal: openAuthorizePage,
  })
  let activeLoopback: SdkworkDesktopLoopbackPort | undefined
  let disposed = false
  /** Stop the loopback listener without letting a transport failure escape. */
  const stopLoopback = (): void => {
    const loopback = activeLoopback
    activeLoopback = undefined
    if (loopback !== undefined) {
      void loopback.cancel().catch(() => {})
    }
  }
  /**
   * Whether the controller refused a callback the pending flow can ignore.
   *
   * The runtime and this module can hold different copies of the auth package
   * (the generated bundles inline it), so the error's stable `code` contract is
   * read instead of relying on one class identity.
   */
  const isStaleCallback = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return false
    const { code } = error as { code?: unknown }
    return code === 'no-pending-flow' || code === 'state-mismatch'
  }
  /**
   * Random throwaway token in the PKCE challenge shape. A diagnostic probe
   * never redeems the authorization it starts, so its state and challenge
   * carry no secret.
   */
  const throwawayToken = (): string => {
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
  }
  /**
   * Recover the server's own answer when the hosted page failed to start the
   * authorization.
   *
   * That page owns the bootstrap request, so its response never reaches the
   * app: it only reports `provider-denied` + `server_error`, and the failure
   * card would show that one string. Asking the same anonymous endpoint again
   * recovers the HTTP status, wire code, trace id, and problem document for the
   * details view. Only a rejected probe is reported as the answer; a probe that
   * starts an authorization explains nothing about the page's failure.
   */
  const probeHostedAuthorizationFailure = async (): Promise<void> => {
    try {
      await client.http.request(AUTHORIZATION_BOOTSTRAP_PATH, {
        method: 'POST',
        contentType: 'application/json',
        skipAuth: true,
        sdkworkUnwrapKind: 'item',
        retry: { maxRetries: 0 },
        body: {
          clientId: options.clientId,
          responseType: 'code',
          redirectUri: runtime.descriptor.redirectUri,
          scope: (runtime.descriptor.scopes ?? DEFAULT_DESKTOP_LOGIN_SCOPES).join(' '),
          state: throwawayToken(),
          codeChallenge: throwawayToken(),
          codeChallengeMethod: 'S256',
        },
      })
    } catch (error) {
      if (disposed) return
      const response = readServerFailureResponse(error)
      if (response !== undefined) options.onServerFailure?.(response)
    }
  }
  let pendingPoll: ReturnType<typeof setTimeout> | undefined
  /** Whether a login is still waiting for its callback. */
  const isPending = (): boolean => !disposed && runtime.controller.isWaiting()
  /** Stop asking the shell for a missed callback. */
  const stopPendingPoll = (): void => {
    if (pendingPoll === undefined) return
    clearTimeout(pendingPoll)
    pendingPoll = undefined
  }
  /**
   * Release the attempt's carriers once its controller stopped waiting.
   *
   * Expiry and a rejected exchange end the flow without a session, so the
   * ephemeral loopback port and the take must be released here; a stale link
   * leaves the flow waiting and keeps both.
   * @param error - the failure the runtime reported.
   */
  const releaseSettledAttempt = (error: unknown): void => {
    if (!runtime.controller.isWaiting()) {
      stopLoopback()
      stopPendingPoll()
      authorizeUrl = undefined
    }
    options.onError?.(error)
    // The hosted page dropped the bootstrap response: ask for it again so the
    // failure card can show the server's own answer instead of `server_error`.
    if (!disposed && isHostedAuthorizationStartFailure(error)) void probeHostedAuthorizationFailure()
  }
  /** Hand one redeemed session to the commit, dropping the login's carriers. */
  const deliverSession = async (session: SdkworkDesktopAuthSession): Promise<void> => {
    // The login is settled: the ephemeral port has done its job and must not
    // keep accepting local requests for the rest of its timeout, and no take
    // may still be pending against the shell.
    stopLoopback()
    stopPendingPoll()
    authorizeUrl = undefined
    await options.onSession(session)
  }
  /**
   * Ask the shell for a callback this runtime did not receive as an event.
   *
   * Only a waiting flow polls: the take is destructive, so an idle runtime must
   * never consume a URL a newer attempt needs.
   */
  async function pollPendingCallback(): Promise<void> {
    pendingPoll = undefined
    if (!isPending()) return
    const url = await options.bridge.deepLinks.getInitialUrl().catch(() => null)
    if (!isPending()) return
    if (typeof url === 'string' && url.trim() !== '') {
      try {
        const session = await runtime.controller.handleOpenUrl(url)
        await deliverSession(session)
        return
      } catch (error) {
        // A stale link leaves the pending flow running; the recoverable one
        // still arrives. A settled attempt keeps its own failure report.
        if (!isStaleCallback(error)) releaseSettledAttempt(error)
      }
    }
    schedulePendingPoll()
  }
  /** Schedule the next take unless the flow settled or one is already queued. */
  function schedulePendingPoll(): void {
    if (!isPending() || pendingPoll !== undefined) return
    pendingPoll = setTimeout(() => { void pollPendingCallback() }, PENDING_CALLBACK_POLL_MS)
  }
  const createRuntime = (redirectUri: string, host: SdkworkDesktopAuthHostPort): Runtime =>
    createSdkworkIamDesktopAuthRuntime({
      appId: options.clientId,
      redirectUri,
      authorizeBaseUrl: options.authorizeBaseUrl,
      // Only the redeem leg is bound through the client; the runtime never uses
      // the rest of the generated SDK surface.
      appSdkClient: createAtMostOnceRedeemClient(client, response => options.onServerFailure?.(response)),
      host,
      onSession: session => deliverSession(session),
      onError: error => releaseSettledAttempt(error),
      ...(options.deviceId === undefined ? {} : { deviceId: options.deviceId }),
      ...(options.flowTtlMs === undefined ? {} : { flowTtlMs: options.flowTtlMs }),
    })
  let runtime = createRuntime(options.redirectUri, standardHost)
  let unsubscribeRuntime = runtime.controller.subscribe(notify)

  /** Swap the runtime for one bound to the current callback carrier. */
  const replaceRuntime = (redirectUri: string, host: SdkworkDesktopAuthHostPort): void => {
    stopPendingPoll()
    unsubscribeRuntime()
    runtime.dispose()
    runtime = createRuntime(redirectUri, host)
    unsubscribeRuntime = runtime.controller.subscribe(notify)
  }

  return {
    async begin() {
      if (disposed) throw new Error('the desktop login has been disposed')
      stopPendingPoll()
      authorizeUrl = undefined
      const loopback = options.bridge.loopbackLogin
      if (loopback !== undefined) {
        try {
          const started = await loopback.start()
          activeLoopback = loopback
          replaceRuntime(started.redirectUri, loopbackHost(loopback))
        } catch {
          // The shell declined a listener (older build or a deployment that
          // has not enabled loopback redirects): keep the registered callback.
          console.warn('[ui-sdkwork-iam] loopback redirect unavailable; using the registered callback')
          activeLoopback = undefined
          replaceRuntime(options.redirectUri, standardHost)
        }
      }
      try {
        await runtime.beginLogin()
        schedulePendingPoll()
      } catch (error) {
        // The browser could not be opened: the controller cleared the flow, so
        // the listener and the take must not outlive the failed gesture.
        stopLoopback()
        stopPendingPoll()
        authorizeUrl = undefined
        throw error
      }
    },
    async cancel() {
      stopLoopback()
      stopPendingPoll()
      authorizeUrl = undefined
      await Promise.resolve(runtime.cancelLogin())
    },
    isWaiting: () => runtime.controller.isWaiting(),
    resumePendingLoopback: async () => {
      if (disposed) return false
      const loopback = options.bridge.loopbackLogin
      if (loopback?.pending === undefined) return false
      const pending = await loopback.pending().catch(() => null)
      if (pending === null || disposed) return false
      activeLoopback = loopback
      replaceRuntime(pending.redirectUri, loopbackHost(loopback))
      // A callback accepted while the page was gone has no listener to hear its
      // event; the shell kept the URL for this page. Taking it is destructive,
      // so a code is never replayed by a later page.
      const retained = loopback.takeCallback === undefined
        ? null
        : await loopback.takeCallback().catch(() => null)
      if (retained === null) return true
      try {
        const session = await runtime.controller.handleOpenUrl(retained)
        await deliverSession(session)
      } catch (error) {
        // A stale retained URL belongs to a spent attempt; the live flow (if
        // any) still waits and a later callback can complete it.
        if (!isStaleCallback(error)) releaseSettledAttempt(error)
      }
      return true
    },
    authorizeUrl: () => (runtime.controller.isWaiting() ? authorizeUrl : undefined),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    completePendingCallbackFromLaunch: () => runtime.completePendingCallbackFromLaunch(),
    dispose: () => {
      disposed = true
      stopLoopback()
      stopPendingPoll()
      authorizeUrl = undefined
      unsubscribeRuntime()
      runtime.dispose()
      listeners.clear()
    },
  }
}
