/**
 * Signed-out shell for SDKWork-backed mode pages.
 *
 * Two policies, and the page picks which requirement it states:
 *
 * - `eager` — children mount only after IAM reports signed in; signed out, the
 *   notice stands in for the page. Used by modes whose whole surface is
 *   private (Drive, Knowledge, Assets), where an anonymous visit has nothing
 *   to show.
 * - `deferred` — children always mount, notice never renders. Used by the
 *   creative (生成) modes, whose composer, presets, and inspiration feed are
 *   browsable while signed out; the session is demanded later, by the backend
 *   transport, on the first call that actually needs one.
 *
 * Neither policy opens the modal on its own: the settings-menu sign-in gesture
 * and the notice's own CTA are the explicit ways into the overlay.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuthenticatedModeGate } from './authenticated-mode.ts'
import css from './AuthenticatedModeShell.module.css'

/** How a gated mode page states its sign-in requirement. */
export type SdkworkModeSignInPolicy =
  /** Signed out, the notice replaces the page. */
  | 'eager'
  /** Signed out, the page still renders; the backend transport asks at the door. */
  | 'deferred'

/** Props of the signed-out / signed-in page wrapper. */
export interface AuthenticatedModeShellProps {
  /** Live IAM session face (isSignedIn + overlay + subscribe). */
  gate: AuthenticatedModeGate
  /** Which requirement the page states; defaults to `eager`. */
  policy?: SdkworkModeSignInPolicy
  /** Heading shown while signed out (eager policy). */
  title?: string
  /** Supporting copy shown while signed out (eager policy). */
  detail?: string
  /** Label of the retry sign-in button (eager policy). */
  actionLabel?: string
  /** The SDKWork page to mount after sign-in. */
  children: ReactNode
}

/**
 * Render children while signed in; otherwise the signed-out notice and a
 * button that opens the overlay — unless the page deferred its requirement, in
 * which case children render either way.
 * @param props - gate, policy, copy, and the page tree.
 * @returns the children, or the signed-out notice under the eager policy.
 */
export function AuthenticatedModeShell({
  gate,
  policy = 'eager',
  title,
  detail,
  actionLabel,
  children,
}: AuthenticatedModeShellProps) {
  const signedIn = useSyncExternalStore(
    listener => gate.subscribe(listener),
    () => gate.isSignedIn(),
    () => gate.isSignedIn(),
  )
  // The deferred page is browsable on purpose: it renders before a session
  // exists and lets the first session-bearing backend call raise the overlay.
  if (policy === 'deferred') return children
  if (signedIn) return children
  return (
    <div className={css.shell} data-auth-required="true">
      <IconUserOutline16 size={56} className={css.heroIcon} />
      <div className={css.title}>{title}</div>
      <div className={css.detail}>{detail}</div>
      <Button variant="primary" className={css.action} onClick={() => { gate.openSignInOverlay() }}>
        {actionLabel}
      </Button>
    </div>
  )
}
