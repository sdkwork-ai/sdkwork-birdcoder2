/**
 * Structural mirrors of the desktop-bridge wire contract. The connection
 * package owns the authoritative types (`DesktopBridge` in its `/client`
 * half, `DesktopBridgeHost` in its `/desktop` half); this app declares only
 * the slices it wires, so the shell never needs a build-time project
 * reference into the client stack. The composition spec in the sdkwork-desktop-app
 * bundle proves the wire shapes end to end through the real types.
 * @module @deepseek-ai/dsh-desktop/bridge-types
 */

/** The host bridge surface the main process wires to IPC. */
export interface DesktopBridgeHost {
  fetch(request: Request): Promise<Response>
  openMux(signal: AbortSignal): AsyncIterable<{ rpcId: unknown; payload: unknown }>
  openHost(signal: AbortSignal): AsyncIterable<{ rpcId: unknown; payload: unknown }>
}

/** One unary/respond round-trip request, clone-safe for contextBridge. */
export interface DesktopBridgeRequest {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** The unary/respond response as plain JSON. */
export interface DesktopBridgeResponse {
  status: number
  headers: [string, string][]
  body: string
}

/** Handle for one downlink event-stream subscription. */
export interface DesktopBridgeSubscription {
  unsubscribe(): void
  onEnd(listener: () => void): void
}

/** The frameless window-control surface the renderer's custom title-bar chrome calls. */
export interface DesktopWindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  /** Subscribe to maximize/restore flips; returns the detach function. */
  onMaximizedChanged(listener: (maximized: boolean) => void): () => void
}

/** Update phases the desktop shell's auto-update controller reports. */
type DesktopUpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'

/** Download progress carried in the `downloading` update state. */
interface DesktopUpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/** One pushed update-state snapshot (the connection package owns the authoritative contract). */
export interface DesktopUpdateState {
  phase: DesktopUpdatePhase
  /** Whether this build can download and hand off its platform installer. */
  canInstall: boolean
  /** Version the controller is offering or installing, while one is known. */
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

/** The auto-update surface the renderer's update plugin calls. */
export interface DesktopUpdates {
  /** Read the current update state (the initial poll; transitions arrive on `onState`). */
  getState(): Promise<DesktopUpdateState>
  /** Ask for a quiet check now. */
  check(): void
  /** Start downloading the offered update when the current state permits installer handoff. */
  download(): void
  /** Quit and run the downloaded installer when the current state permits installer handoff. */
  install(): void
  /** Open the release page in the default browser (unsigned Phase A fallback). */
  openReleasePage(): void
  /** Subscribe to update-state transitions; returns the detach function. */
  onState(listener: (state: DesktopUpdateState) => void): () => void
}

/** The preload-exposed surface the renderer's connection plugin selects on. */
export interface DesktopBridge {
  fetch(request: DesktopBridgeRequest): Promise<DesktopBridgeResponse>
  cancel(id: string): void
  subscribe(stream: 'mux' | 'host', listener: (frame: unknown) => void): DesktopBridgeSubscription
  /**
   * Subscribe to tray "open session" commands from the main process; the
   * listener receives the session id the tray menu targeted.
   * @param listener - per-command callback.
   * @returns the detach function.
   */
  onOpenSession(listener: (sessionId: string) => void): () => void
  /** Subscribe to tray "new session" commands from the main process. */
  onNewSession(listener: () => void): () => void
  /** Custom window controls (frameless shell); absent outside the desktop preload. */
  windowControls?: DesktopWindowControls
  /** Auto-update surface; absent outside the desktop preload. */
  updates?: DesktopUpdates
}

/** IPC channel names, shared by the preload and the main process. */
export const IPC_CHANNELS = {
  rpc: 'dsh:rpc',
  cancel: 'dsh:cancel',
  subscribe: 'dsh:subscribe',
  unsubscribe: 'dsh:unsubscribe',
  frame: 'dsh:frame',
  streamEnd: 'dsh:stream-end',
  windowAction: 'dsh:window-action',
  windowState: 'dsh:window-state',
  windowMaximized: 'dsh:window-maximized',
  openSession: 'dsh:open-session',
  newSession: 'dsh:new-session',
  updateGetState: 'dsh:update-get-state',
  updateAction: 'dsh:update-action',
  updateState: 'dsh:update-state',
} as const
