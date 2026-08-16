/**
 * IPC wiring for the desktop shell: unary/respond round trips and the two
 * downlink event streams between the renderer and the host bridge. The renderer
 * is the local user's window, so every request is normalized to the loopback
 * authority before dispatch — the desktop analogue of a same-origin loopback
 * web page, which is exactly the trust the /api fence grants loopback.
 * @module @deepseek-ai/dsh-desktop/ipc
 */

import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, type DesktopBridgeHost, type DesktopBridgeRequest } from './bridge-types.ts'
import { diagLog } from './diag.ts'
import type { DesktopUpdater } from './update.ts'

/** Per-subscription-id abort controllers for the downlink pumps. */
const pumps = new Map<string, AbortController>()

/** Wrap one RpcRequest frame in its full ServerRequest envelope (the renderer re-parses it). */
function serverRequest(frame: { rpcId: unknown; payload: { type: string } }): Record<string, unknown> {
  return { type: 'server-request', rpcId: frame.rpcId, method: frame.payload.type, payload: frame.payload }
}

/**
 * Register the IPC surface over the host bridge: `dsh:rpc` (unary/respond),
 * `dsh:cancel` (abandon), and the `dsh:subscribe`/`dsh:unsubscribe` downlink
 * stream protocol.
 * @param bridge - the host bridge service from the booted tree.
 */
export function registerIpc(bridge: DesktopBridgeHost): void {
  ipcMain.handle(IPC_CHANNELS.rpc, async (_event, payload: DesktopBridgeRequest) => {
    const startedAt = Date.now()
    const controller = new AbortController()
    pumps.set(payload.id, controller)
    try {
      // Loopback normalization: the renderer's origin is app://dsh, whose
      // hostname is not loopback — rewriting the authority makes the shared
      // /api fence treat this window like a same-origin loopback page (the
      // trust model this shell claims by construction: only our own window
      // reaches these channels). A fresh URL is built because mutating a
      // non-special scheme's protocol in place is a no-op per the URL spec.
      const parsed = new URL(payload.url)
      const url = new URL(`http://127.0.0.1${parsed.pathname}${parsed.search}`)
      const headers = new Headers(payload.headers)
      headers.set('host', '127.0.0.1')
      const request = new Request(url, {
        method: payload.method,
        headers,
        ...payload.body !== undefined ? { body: payload.body } : {},
        signal: controller.signal,
      })
      const response = await bridge.fetch(request)
      const body = await response.text()
      const elapsed = Date.now() - startedAt
      // TEMP-DIAG: slow RPC telemetry for the packaged freeze investigation.
      if (elapsed > 1_500) {
        diagLog(`rpc slow ${elapsed}ms ${payload.method} ${parsed.pathname} req=${payload.body?.length ?? 0} res=${body.length}`)
      }
      return { status: response.status, headers: [...response.headers], body }
    } finally {
      pumps.delete(payload.id)
    }
  })

  ipcMain.on(IPC_CHANNELS.cancel, (_event, id: string) => {
    pumps.get(id)?.abort()
    pumps.delete(id)
  })

  ipcMain.handle(IPC_CHANNELS.subscribe, (event, payload: { stream: 'mux' | 'host'; subId: string }) => {
    const wc = event.sender
    const controller = new AbortController()
    pumps.set(payload.subId, controller)
    const frames = payload.stream === 'mux'
      ? bridge.openMux(controller.signal)
      : bridge.openHost(controller.signal)
    const onDestroyed = (): void => { controller.abort() }
    wc.once('destroyed', onDestroyed)
    void (async () => {
      try {
        for await (const frame of frames) {
          if (wc.isDestroyed()) break
          const startedAt = Date.now()
          wc.send(IPC_CHANNELS.frame, {
            subId: payload.subId,
            frame: serverRequest(frame as { rpcId: unknown; payload: { type: string } }),
          })
          // TEMP-DIAG: frame push backpressure for the packaged freeze investigation.
          const elapsed = Date.now() - startedAt
          if (elapsed > 500) {
            diagLog(`frame send slow ${elapsed}ms subId=${payload.subId}`)
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[dsh-desktop] event stream failed:', error)
        }
      } finally {
        wc.off('destroyed', onDestroyed)
        pumps.delete(payload.subId)
        if (!wc.isDestroyed()) wc.send(IPC_CHANNELS.streamEnd, { subId: payload.subId })
      }
    })()
    return { ok: true }
  })

  ipcMain.on(IPC_CHANNELS.unsubscribe, (_event, subId: string) => {
    pumps.get(subId)?.abort()
    pumps.delete(subId)
  })
}

/**
 * Register the frameless window-control surface: the renderer's custom
 * title-bar chrome sends one-shot actions and queries the maximize state; the
 * main process pushes maximize/restore flips back on `dsh:window-maximized`.
 * The sender's own BrowserWindow is the target, so any shell window (today
 * exactly one) gets correct routing without a captured handle.
 */
export function registerWindowIpc(): void {
  ipcMain.on(IPC_CHANNELS.windowAction, (event, action: 'minimize' | 'toggle-maximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === null) return
    switch (action) {
      case 'minimize':
        win.minimize()
        break
      case 'toggle-maximize':
        if (win.isMaximized()) win.unmaximize()
        else win.maximize()
        break
      case 'close':
        win.close()
        break
    }
  })

  ipcMain.handle(IPC_CHANNELS.windowState, (event): { maximized: boolean } => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return { maximized: win?.isMaximized() ?? false }
  })
}

/** Update actions the renderer may request; anything else is ignored at the wire. */
const UPDATE_ACTIONS = ['check', 'download', 'install', 'open-release-page'] as const

type UpdateAction = typeof UPDATE_ACTIONS[number]

/** Narrow a wire value to the known update actions. */
function isUpdateAction(value: unknown): value is UpdateAction {
  return typeof value === 'string' && (UPDATE_ACTIONS as readonly string[]).includes(value)
}

/**
 * Register the auto-update IPC surface: the state poll (`dsh:update-get-state`)
 * and the one-shot actions (`dsh:update-action`); the main process pushes
 * transitions on `dsh:update-state` from the updater itself.
 * @param updater - the installed updater surface.
 */
export function registerUpdateIpc(updater: DesktopUpdater): void {
  ipcMain.handle(IPC_CHANNELS.updateGetState, () => updater.getState())
  ipcMain.on(IPC_CHANNELS.updateAction, (_event, action: unknown) => {
    if (!isUpdateAction(action)) return
    switch (action) {
      case 'check': void updater.checkNow(); break
      case 'download': void updater.download(); break
      case 'install': updater.install(); break
      case 'open-release-page': updater.openReleasePage(); break
    }
  })
}
