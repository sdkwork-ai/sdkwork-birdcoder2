/**
 * The IAM session face shared by the SDKWork-backed mode pages. A gated page
 * states its own requirement: while signed out it renders the signed-out
 * notice and opens the modal only from that notice's own sign-in button, so
 * no navigation or mode switch raises a sign-in surface the user did not ask
 * for.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'

/**
 * The session face a gated mode page shares.
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
 * Inject the IAM gate and mode id shared by SDKWork-backed mode pages.
 * @param ctx - client root context carrying the live `iam` service.
 * @param mode - the keyed `mode.page` registration id.
 * @returns injected page props for `AuthenticatedSdkworkModePage`.
 */
export function injectAuthenticatedModePage<M extends AppModeId>(
  ctx: Pick<Context, 'get'>,
  mode: M,
): { authGate: AuthenticatedModeGate; mode: M } {
  return {
    mode,
    authGate: ctx.get('iam') as AuthenticatedModeGate,
  }
}
