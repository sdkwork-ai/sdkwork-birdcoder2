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

import { createSdkworkIamDesktopAuthRuntime, type SdkworkDesktopAuthHostPort, type SdkworkDesktopAuthSession, type SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'
import { appApiPath, createClient, type SdkworkAppClient } from '@sdkwork/iam-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** Path of the generated desktop-session redeem operation. */
const DESKTOP_SESSION_REDEEM_PATH = appApiPath('/oauth/desktop_sessions')

/** The generated-client slice the desktop auth runtime binds for its redeem leg. */
type RedeemSdkClient = Parameters<typeof createSdkworkIamDesktopAuthRuntime>[0]['appSdkClient']

/**
 * Bind the redeem leg to the generated transport with at-most-once delivery.
 *
 * The generated transport retries a request up to three times on transport
 * failures and 5xx responses. Both are exactly the cases where the server may
 * already have consumed the code, so the retry can only return "code invalid or
 * expired" while the first attempt succeeded — and a browser hand-off that
 * auto-fires and a user clicking its link can submit the same code twice.
 * One request per code makes both harmless: the second delivery observes the
 * first one's outcome instead of redeeming again. Recovery from a genuinely
 * failed redeem is the card's retry, which starts a fresh browser login.
 * @param client - generated app client carrying the shared token manager.
 * @returns the client slice the desktop runtime redeems through.
 */
function createAtMostOnceRedeemClient(client: SdkworkAppClient): RedeemSdkClient {
  let attempted: { code: unknown; result: Promise<unknown> } | undefined
  return {
    oauth: {
      desktopSessions: {
        create: (command?: unknown) => {
          const body = command as Record<string, unknown>
          const code = body.authorizationCode
          if (attempted !== undefined && attempted.code === code) return attempted.result
          const result = client.http.request<unknown>(DESKTOP_SESSION_REDEEM_PATH, {
            method: 'POST',
            contentType: 'application/json',
            skipAuth: true,
            sdkworkUnwrapKind: 'data',
            retry: { maxRetries: 0 },
            body,
          })
          attempted = { code, result }
          return result
        },
      },
    },
  }
}

/** The preload global the desktop shell exposes. */
interface SdkworkDesktopGlobal {
  readonly sdkworkDesktop?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the standard `sdkworkDesktop` bridge from the page.
 * @returns the validated bridge, or undefined outside the desktop shell.
 */
export function readSdkworkDesktopBridge(): SdkworkDesktopBridgeShape | undefined {
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
  return {
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
  /** Registered deep-link callback the hosted login returns through. */
  redirectUri: string
  /** Hosted IAM authorization origin, e.g. `https://platform.birdcoder.com`. */
  authorizeBaseUrl: string
  /** IAM app-api origin used for the desktop-session exchange. */
  baseUrl: string
  tokenManager: AuthTokenManager
  bridge: SdkworkDesktopBridgeShape
  /** Stable opaque per-install device identity used to scope the session. */
  deviceId?: string
  /** Deadline of the pending flow; defaults to the desktop runtime's own window. */
  flowTtlMs?: number
  /** Commit the redeemed dual-token session into the product auth runtime. */
  onSession: (session: SdkworkDesktopAuthSession) => void | Promise<void>
  onError?: (error: unknown) => void
}

/** The renderer-facing desktop login controls. */
export interface IamDesktopLogin {
  begin(): Promise<void>
  cancel(): Promise<void>
  isWaiting(): boolean
  subscribe(listener: () => void): () => void
  completePendingCallbackFromLaunch(): Promise<boolean>
  dispose(): void
}

/**
 * Build the desktop browser-login flow over the standard preload bridge.
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
  const host: SdkworkDesktopAuthHostPort = {
    id: 'electron',
    async getInitialUrl() {
      return options.bridge.deepLinks.getInitialUrl()
    },
    onOpenUrl(handler) {
      return options.bridge.deepLinks.onOpenUrl(handler)
    },
    async openExternal(url) {
      await options.bridge.shellOpen.open(url)
    },
  }
  const runtime = createSdkworkIamDesktopAuthRuntime({
    appId: options.clientId,
    redirectUri: options.redirectUri,
    authorizeBaseUrl: options.authorizeBaseUrl,
    // Only the redeem leg is bound through the client; the runtime never uses
    // the rest of the generated SDK surface.
    appSdkClient: createAtMostOnceRedeemClient(client),
    host,
    onSession: options.onSession,
    ...(options.deviceId === undefined ? {} : { deviceId: options.deviceId }),
    ...(options.flowTtlMs === undefined ? {} : { flowTtlMs: options.flowTtlMs }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  })
  return {
    begin: () => runtime.beginLogin(),
    cancel: async () => { await runtime.cancelLogin() },
    isWaiting: () => runtime.controller.isWaiting(),
    subscribe: listener => runtime.controller.subscribe(listener),
    completePendingCallbackFromLaunch: () => runtime.completePendingCallbackFromLaunch(),
    dispose: () => { runtime.dispose() },
  }
}
