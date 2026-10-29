/**
 * The SDKWork desktop deep-link bridge: OS protocol registration, deep-link
 * collection, and the `sdkwork:deepLinks:*` / `sdkwork:shellOpen:*` IPC
 * allowlist the hosted IAM login returns through.
 *
 * Channel names and the preload key mirror `@sdkwork/iam-desktop-auth`'s
 * `SDKWORK_DESKTOP_BRIDGE` contract, so the renderer's IAM module uses the
 * same bridge shape upstream SDKWork applications expose. The desktop shell
 * keeps the Electron objects here; the renderer only sees the preload bridge.
 *
 * The callback is the deployment's registered redirect URI
 * (`sdkwork.iamRedirectUri` in the OEM profile, shipped as
 * `birdcoder://auth/callback`). Every other URL delivered to the application —
 * the product's own `birdcoder://open` link, for example — is left alone.
 */

import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'

/** Standard SDKWork desktop bridge channels; keep in step with `@sdkwork/iam-desktop-auth`. */
export const SDKWORK_DESKTOP_BRIDGE = {
  deepLinksGetInitialUrl: 'sdkwork:deepLinks:getInitialUrl',
  deepLinksOpenEvent: 'sdkwork:deepLinks:open',
  shellOpen: 'sdkwork:shellOpen:open',
} as const

/** Window key the preload exposes the bridge under. */
export const SDKWORK_DESKTOP_PRELOAD_KEY = 'sdkworkDesktop'

/** Electron surface the main-process bridge needs. */
export interface IamDeepLinkApp {
  readonly isPackaged: boolean
  on(event: 'open-url', listener: (event: { preventDefault(): void }, url: string) => void): unknown
  on(event: 'second-instance', listener: (event: unknown, argv: readonly string[]) => void): unknown
  off?(event: string, listener: (...args: never[]) => void): unknown
  setAsDefaultProtocolClient(scheme: string): boolean
}

/** Shell surface the main-process bridge needs. */
export interface IamDeepLinkShell {
  openExternal(url: string): Promise<void>
}

/** One renderer-facing bridge instance. */
export interface IamDeepLinkBridge {
  /** URL the OS handed the app at launch, if any. */
  getInitialUrl(): string | null
  dispose(): void
}

export interface IamDeepLinkBridgeOptions {
  app: IamDeepLinkApp
  ipcMain: Pick<IpcMain, 'handle'> & Partial<Pick<IpcMain, 'removeHandler'>>
  shell: IamDeepLinkShell
  /**
   * Registered deep-link callback the IAM flow completes on. Only URLs that
   * match its scheme, authority, and path enter the flow; its scheme is the OS
   * protocol this bridge registers.
   */
  redirectUri: string
  /** Window that receives live deep links; undefined while the window starts. */
  getWindow: () => BrowserWindow | undefined
  /** Reject a bridge call from a frame this application does not own. */
  assertSender: (event: IpcMainInvokeEvent) => void
  /** Register the OS protocol handler (packaged or explicit dev application). */
  registerScheme: boolean
  /** Admit plain-HTTP authorize pages in a development launch. */
  allowInsecureHttp?: boolean
  /** Deep link captured before the bridge existed (macOS launch); wins over argv. */
  initialUrl?: string | null
  /** Process arguments to scan at startup (defaults to `process.argv`). */
  argv?: readonly string[]
}

/** One parsed deep-link shape: what the callback contract compares. */
interface DeepLinkShape {
  host: string
  pathname: string
  protocol: string
}

function deepLinkShape(uri: string): DeepLinkShape | null {
  let parsed: URL
  try {
    parsed = new URL(uri.trim())
  } catch {
    return null
  }
  return {
    host: parsed.host.toLowerCase(),
    pathname: parsed.pathname.replace(/\/+$/u, ''),
    protocol: parsed.protocol.toLowerCase(),
  }
}

/**
 * Whether one URL is the registered IAM callback.
 *
 * The product and the hosted login share the application's URL scheme
 * (`birdcoder://open` is the product link, `birdcoder://auth/callback` the
 * login return), so the scheme alone cannot identify a callback; the authority
 * and path must match the registered redirect too.
 * @param candidate - URL delivered by the OS or found in the launch arguments.
 * @param redirectUri - registered redirect the flow completes on.
 * @returns true when the URL is the IAM callback.
 */
export function matchesIamRedirectUri(candidate: string, redirectUri: string): boolean {
  const actual = deepLinkShape(candidate)
  const expected = deepLinkShape(redirectUri)
  return actual !== null && expected !== null
    && actual.protocol === expected.protocol
    && actual.host === expected.host
    && actual.pathname === expected.pathname
}

/**
 * Pick the last IAM callback out of the URLs a launch delivered.
 * @param candidates - URLs in delivery order.
 * @param redirectUri - registered redirect the flow completes on.
 * @returns the last matching URL, or null when none matched.
 */
export function findIamDeepLink(candidates: readonly string[], redirectUri: string): string | null {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    if (candidate !== undefined && matchesIamRedirectUri(candidate, redirectUri)) return candidate
  }
  return null
}

/** The custom scheme one redirect URI registers, without its trailing colon. */
function redirectScheme(redirectUri: string): string {
  const shape = deepLinkShape(redirectUri)
  if (shape === null || shape.host === '' || shape.protocol === 'file:') {
    throw new Error('sdkwork IAM deep links require an absolute custom-scheme redirect URI')
  }
  return shape.protocol.slice(0, -1)
}

function assertOpenable(url: string, allowInsecureHttp: boolean, scheme: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('sdkwork shellOpen requires an absolute URL')
  }
  const allowed = parsed.protocol === 'https:'
    || (allowInsecureHttp && parsed.protocol === 'http:')
    || parsed.protocol === `${scheme}:`
  if (!allowed) throw new Error(`sdkwork shellOpen refused scheme ${parsed.protocol}`)
}

/**
 * Wire the Electron main process to the SDKWork desktop bridge.
 * @param options - Electron surfaces, window resolver, sender guard, redirect, and scheme flag.
 * @returns the bridge handle used for the initial URL and teardown.
 */
export function createIamDeepLinkBridge(options: IamDeepLinkBridgeOptions): IamDeepLinkBridge {
  const { app, ipcMain, shell } = options
  const scheme = redirectScheme(options.redirectUri)
  let initialUrl = options.initialUrl ?? findIamDeepLink(options.argv ?? process.argv, options.redirectUri)
  let disposed = false

  if (options.registerScheme) app.setAsDefaultProtocolClient(scheme)

  const handleOpenUrl = (event: { preventDefault(): void }, url: string): void => {
    // Another listener owns the product's own deep links; claiming the event
    // before matching would make this bridge swallow them.
    if (disposed || typeof url !== 'string' || !matchesIamRedirectUri(url, options.redirectUri)) return
    event.preventDefault()
    initialUrl = url
    options.getWindow()?.webContents.send(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, url)
  }

  const handleSecondInstance = (_event: unknown, argv: readonly string[]): void => {
    if (!Array.isArray(argv)) return
    const url = findIamDeepLink(argv, options.redirectUri)
    if (url !== null) {
      initialUrl = url
      options.getWindow()?.webContents.send(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, url)
    }
  }

  app.on('open-url', handleOpenUrl)
  // The protocol handler and the second-instance deep link are one feature:
  // an app that is not the OS handler has no later instance to route.
  if (options.registerScheme) app.on('second-instance', handleSecondInstance)

  ipcMain.handle(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl, (event) => {
    options.assertSender(event)
    return initialUrl
  })
  ipcMain.handle(SDKWORK_DESKTOP_BRIDGE.shellOpen, async (event, url: unknown) => {
    options.assertSender(event)
    if (typeof url !== 'string' || url.trim() === '') throw new Error('sdkwork shellOpen requires a URL string')
    assertOpenable(url, options.allowInsecureHttp === true, scheme)
    await shell.openExternal(url)
  })

  return {
    getInitialUrl: () => initialUrl,
    dispose: () => {
      disposed = true
      app.off?.('open-url', handleOpenUrl)
      if (options.registerScheme) app.off?.('second-instance', handleSecondInstance)
      ipcMain.removeHandler?.(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)
      ipcMain.removeHandler?.(SDKWORK_DESKTOP_BRIDGE.shellOpen)
      // The OS protocol registration belongs to the installed application, not
      // to this bridge: the same scheme also routes the product's own deep
      // links, so unregistering it on teardown would break those until the next
      // launch.
    },
  }
}
