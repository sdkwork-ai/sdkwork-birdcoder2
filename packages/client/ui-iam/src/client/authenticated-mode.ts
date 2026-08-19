/**
 * App modes whose SDKWork surfaces need a signed-in IAM session. Code, Work,
 * Account, and Token Plan stay reachable while signed out: Code is the
 * workbench, Account is the sign-in page, Token Plan still serves the
 * anonymous catalog and opens sign-in only at checkout.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Mode ids that must not mount their SDKWork page until IAM reports signed in. */
export const AUTHENTICATED_APP_MODES = [
  'knowledge',
  'drive',
  'assets',
  'appstore',
  'image',
  'video',
] as const satisfies readonly AppModeId[]

/** A mode id from {@link AUTHENTICATED_APP_MODES}. */
export type AuthenticatedAppModeId = (typeof AUTHENTICATED_APP_MODES)[number]

/**
 * The session face a gated mode page and the mode rail share.
 * `subscribe` must notify when {@link AuthenticatedModeGate.isSignedIn} changes.
 */
export interface AuthenticatedModeGate {
  /** @returns whether the IAM controller currently has a signed-in session. */
  isSignedIn(): boolean
  /** Open the modal sign-in overlay (no-op while already signed in). */
  openSignInOverlay(): void
  /** Observe session changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Whether switching to `mode` requires a signed-in IAM session.
 * @param mode - the frame mode the rail or layout is about to show.
 * @returns true for Knowledge, Drive, Assets, App Store, Image, and Video.
 */
export function isAuthenticatedAppMode(mode: AppModeId): mode is AuthenticatedAppModeId {
  return (AUTHENTICATED_APP_MODES as readonly AppModeId[]).includes(mode)
}

/**
 * Switch the frame mode, then open the sign-in overlay when that mode needs a
 * session and the user is signed out. Ungated modes and signed-in sessions
 * only switch.
 * @param gate - the live IAM session face.
 * @param mode - the mode the rail entry requested.
 * @param setMode - the layout store's mode switch.
 */
export function requestAuthenticatedMode(
  gate: AuthenticatedModeGate,
  mode: AppModeId,
  setMode: (mode: AppModeId) => void,
): void {
  setMode(mode)
  if (isAuthenticatedAppMode(mode) && !gate.isSignedIn()) {
    gate.openSignInOverlay()
  }
}

/**
 * Inject the IAM gate and mode id shared by SDKWork-backed mode pages.
 * @param ctx - client root context carrying the live `iam` service.
 * @param mode - the keyed `mode.page` registration id.
 * @returns injected page props for {@link AuthenticatedSdkworkModePage}.
 */
export function injectAuthenticatedModePage<M extends AuthenticatedAppModeId>(
  ctx: Pick<Context, 'get'>,
  mode: M,
): { authGate: AuthenticatedModeGate; mode: M } {
  return {
    mode,
    authGate: ctx.get('iam') as AuthenticatedModeGate,
  }
}
