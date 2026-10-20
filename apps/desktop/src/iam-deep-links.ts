/**
 * The SDKWork desktop deep-link bridge: OS protocol registration, deep-link
 * collection, and the `sdkwork:deepLinks:*` / `sdkwork:shellOpen:*` IPC
 * allowlist the hosted IAM login returns through.
 *
 * Channel names and the preload key mirror `@sdkwork/iam-desktop-auth`'s
 * `SDKWORK_DESKTOP_BRIDGE` contract, so the renderer's IAM module uses the
 * same bridge shape upstream SDKWork applications expose. The desktop shell
 * keeps the Electron objects here; the renderer only sees the preload bridge.
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

/**
 * Deep-link scheme for this tenant application. It matches the IAM app id
 * (`sdkwork-birdcoder`), which the hosted authorization uses as `client_id`
 * and the deep-link redirect as `sdkwork-birdcoder://auth/callback`.
 */
export const IAM_DEEP_LINK_SCHEME = 'sdkwork-birdcoder'

/** Electron surface the main-process bridge needs. */
export interface IamDeepLinkApp {
  readonly isPackaged: boolean
  on(event: 'open-url', listener: (event: { preventDefault(): void }, url: string) => void): unknown
  on(event: 'second-instance', listener: (event: unknown, argv: readonly string[]) => void): unknown
  off?(event: string, listener: (...args: never[]) => void): unknown
  setAsDefaultProtocolClient(scheme: string): boolean
  removeAsDefaultProtocolClient?(scheme: string): boolean
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

function findDeepLink(argv: readonly string[]): string | null {
  // Windows and Linux deliver the deep link as the last process argument.
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const argument = argv[index]
    if (argument?.toLowerCase().startsWith(`${IAM_DEEP_LINK_SCHEME.toLowerCase()}:`)) return argument
  }
  return null
}

function assertOpenable(url: string, allowInsecureHttp: boolean): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('sdkwork shellOpen requires an absolute URL')
  }
  const allowed = parsed.protocol === 'https:'
    || (allowInsecureHttp && parsed.protocol === 'http:')
    || parsed.protocol === `${IAM_DEEP_LINK_SCHEME}:`
  if (!allowed) throw new Error(`sdkwork shellOpen refused scheme ${parsed.protocol}`)
}

/**
 * Wire the Electron main process to the SDKWork desktop bridge.
 * @param options - Electron surfaces, window resolver, sender guard, and scheme flag.
 * @returns the bridge handle used for the initial URL and teardown.
 */
export function createIamDeepLinkBridge(options: IamDeepLinkBridgeOptions): IamDeepLinkBridge {
  const { app, ipcMain, shell } = options
  let initialUrl = options.initialUrl ?? findDeepLink(options.argv ?? process.argv)
  let disposed = false

  if (options.registerScheme) app.setAsDefaultProtocolClient(IAM_DEEP_LINK_SCHEME)

  const handleOpenUrl = (event: { preventDefault(): void }, url: string): void => {
    event.preventDefault()
    if (disposed || typeof url !== 'string') return
    initialUrl = url
    options.getWindow()?.webContents.send(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, url)
  }

  const handleSecondInstance = (_event: unknown, argv: readonly string[]): void => {
    if (!Array.isArray(argv)) return
    const url = findDeepLink(argv)
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
    assertOpenable(url, options.allowInsecureHttp === true)
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
      app.removeAsDefaultProtocolClient?.(IAM_DEEP_LINK_SCHEME)
    },
  }
}
