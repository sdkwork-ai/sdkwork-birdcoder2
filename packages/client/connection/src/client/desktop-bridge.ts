/**
 * Wire types for the Electron desktop bridge: the plain-JSON surface the
 * sandboxed preload exposes to the renderer. Context isolation forbids passing
 * `Response`/`AbortSignal` objects across the world boundary, so unary RPC
 * round-trips as JSON request → `{status, headers, body}` response, streams
 * arrive as per-frame listener callbacks, and cancellation is a named
 * request-id call.
 * @module @deepseek-ai/dsh-client-connection/desktop-bridge
 */

import type { ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One unary/respond round-trip request, clone-safe for contextBridge. */
export interface DesktopBridgeRequest {
  /** Caller-chosen id echoed by {@link DesktopBridge.cancel}. */
  id: string
  /** Absolute URL; the main process routes on its pathname. */
  url: string
  /** HTTP method (POST for every RPC call today). */
  method: string
  /** Headers as a plain record (lowercase names). */
  headers: Record<string, string>
  /** Request body text; absent for body-less calls. */
  body?: string
}

/** The unary/respond response as plain JSON (Response objects cannot cross the bridge). */
export interface DesktopBridgeResponse {
  status: number
  headers: [string, string][]
  body: string
}

/** Handle for one downlink event-stream subscription. */
export interface DesktopBridgeSubscription {
  /** Detach the frame listener; the main process stops pumping the stream. */
  unsubscribe(): void
  /**
   * Register the stream-end callback: fires once the host side finished the
   * generator (host teardown, explicit abort) — the IPC analogue of a
   * WebSocket close.
   * @param listener - invoked at most once.
   */
  onEnd(listener: () => void): void
}

/** Carrier-safe failure delivered by the Host over one Remote stream. */
export interface DesktopStreamFailure {
  readonly code: string
  readonly message: string
  readonly details: object
}

/** One logical Remote stream frame pushed by the Host (the IPC analogue of the Gateway mux frames). */
export type DesktopStreamFrame =
  | { readonly type: 'item'; readonly value?: unknown }
  | { readonly type: 'error'; readonly error: DesktopStreamFailure }
  | { readonly type: 'end' }

/** One logical Remote stream open request. */
export interface DesktopStreamRequest {
  /** Typert Remote stream endpoint such as `session/control`. */
  readonly endpoint: string
  /** Endpoint request encoded on the wire (`{ args }`). */
  readonly payload: unknown
}

/** Handle for one Host Remote stream opened over IPC. */
export interface DesktopStreamHandle {
  /** Stop the stream and release the Host generator. */
  cancel(): void
  /**
   * Register the terminal callback: fires at most once when the Host finished
   * the stream (normal end, Host error frame, or explicit cancellation).
   * @param listener - invoked at most once.
   */
  onEnd(listener: () => void): void
}

/**
 * The frameless window-control surface a renderer may use when it runs inside
 * the Electron app. Rendered by this repo's custom title-bar chrome
 * (`dsh-client-ui-sdkwork-window-controls`); absent in the browser composition.
 */
export interface DesktopWindowControls {
  /** Minimize the window. */
  minimize(): void
  /** Maximize, or restore when already maximized. */
  toggleMaximize(): void
  /** Close the window (and, with it, the app). */
  close(): void
  /** Resolve the current maximize state (for the initial toggle glyph). */
  isMaximized(): Promise<boolean>
  /**
   * Subscribe to maximize/restore flips so the glyph follows the real state
   * (keyboard snap, double-click drag region).
   * @param listener - called with the new maximized flag.
   * @returns the detach function.
   */
  onMaximizedChanged(listener: (maximized: boolean) => void): () => void
}

/** Update phases the desktop shell's auto-update controller reports. */
export type DesktopUpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'

/** Download progress carried in the `downloading` update state. */
export interface DesktopUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/** One update-state snapshot pushed by the main process updater. */
export interface DesktopUpdateState {
  phase: DesktopUpdatePhase
  /** Whether this build can download and hand off its platform installer. */
  canInstall: boolean
  /** Version the updater is offering or installing, while one is known. */
  version?: string
  /** GitHub release title, when the provider reported one. */
  releaseName?: string
  /** GitHub release body markdown, when the provider reported one. */
  releaseNotes?: string
  /** Download progress; present while the phase is `downloading`. */
  progress?: DesktopUpdateProgress
  /** Human-readable driver failure; cleared by the next check. */
  error?: string
}

/**
 * The auto-update surface a renderer may use when it runs inside the Electron
 * app. Rendered by this repo's update banner plugin
 * (`dsh-client-ui-sdkwork-updater`); absent in the browser composition. The main
 * process owns the state machine; the renderer polls once and follows pushes.
 */
export interface DesktopUpdates {
  /** Read the current update state (the initial poll; transitions arrive on {@link onState}). */
  getState(): Promise<DesktopUpdateState>
  /** Ask for a quiet check now. */
  check(): void
  /** Start downloading the offered update when {@link DesktopUpdateState.canInstall} is true. */
  download(): void
  /** Quit and run the downloaded installer when {@link DesktopUpdateState.canInstall} is true. */
  install(): void
  /** Open the release page in the default browser (unsigned Phase A fallback). */
  openReleasePage(): void
  /**
   * Subscribe to update-state transitions.
   * @param listener - called with each new state.
   * @returns the detach function.
   */
  onState(listener: (state: DesktopUpdateState) => void): () => void
}

/**
 * The desktop shell surface a renderer may use when it runs inside the
 * Electron app (exposed as `window.desktopBridge` by the preload; the
 * connection plugin selects {@link IpcApiClient} on its presence).
 */
export interface DesktopBridge {
  /** Unary/respond round trip: POST-shaped JSON over IPC. */
  fetch(request: DesktopBridgeRequest): Promise<DesktopBridgeResponse>
  /** Abandon an in-flight request; the main process aborts its fetch handler. */
  cancel(id: string): void
  /**
   * Subscribe to one downlink event stream (`mux` or `host`). The listener
   * receives validated full-form ServerRequests; frames are pushed in order.
   * @param stream - the logical stream name (mirrors the WebSocket path tail).
   * @param listener - per-frame callback.
   */
  subscribe(stream: 'mux' | 'host', listener: (frame: ServerRequest) => void): DesktopBridgeSubscription
  /**
   * Open one Gateway Remote stream over IPC. Frames arrive on the listener;
   * the handle carries cancellation and the terminal callback.
   * @param request - endpoint and wire payload.
   * @param onFrame - per-frame callback (items and terminal error/end).
   * @returns handle owning cancellation and the end callback.
   */
  openStream(
    request: DesktopStreamRequest,
    onFrame: (frame: DesktopStreamFrame) => void,
  ): DesktopStreamHandle
  /**
   * Subscribe to tray "open session" commands from the Electron main process.
   * The desktop shell's tray menu lists the host corpus; the listener opens
   * the requested session in the shell.
   * @param listener - per-command callback with the target session id.
   * @returns the detach function.
   */
  onOpenSession(listener: (sessionId: SessionId) => void): () => void
  /** Subscribe to tray "new session" commands from the Electron main process. */
  onNewSession(listener: () => void): () => void
  /** The desktop app version, for diagnostics. */
  version: string
  /** Custom window controls (frameless shell); present only in the desktop preload. */
  windowControls?: DesktopWindowControls
  /** Auto-update surface; present only in the desktop preload. */
  updates?: DesktopUpdates
}
