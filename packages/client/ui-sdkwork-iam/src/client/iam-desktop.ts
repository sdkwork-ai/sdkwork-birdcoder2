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
 */

import { createSdkworkIamDesktopAuthRuntime, type SdkworkDesktopAuthHostPort, type SdkworkDesktopAuthSession, type SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'
import { createClient } from '@sdkwork/iam-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'

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
    appSdkClient: client,
    host,
    onSession: options.onSession,
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
