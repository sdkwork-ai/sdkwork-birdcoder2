/**
 * Signed-out shell for SDKWork-backed mode pages.
 *
 * A gated page states its own requirement: children mount only after IAM
 * reports signed in, and while signed out the notice stands in for the page.
 * The shell never opens the modal on its own — the settings-menu sign-in
 * gesture and the notice's own CTA are the explicit ways into the overlay.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuthenticatedModeGate } from './authenticated-mode.ts'
import css from './AuthenticatedModeShell.module.css'

/** Props of the signed-out / signed-in page wrapper. */
export interface AuthenticatedModeShellProps {
  /** Live IAM session face (isSignedIn + overlay + subscribe). */
  gate: AuthenticatedModeGate
  /** Heading shown while signed out. */
  title: string
  /** Supporting copy shown while signed out. */
  detail: string
  /** Label of the retry sign-in button. */
  actionLabel: string
  /** The SDKWork page to mount after sign-in. */
  children: ReactNode
}

/**
 * Render children while signed in; otherwise the signed-out notice and a
 * button that opens the overlay.
 * @param props - gate, copy, and the page tree.
 * @returns the children, or the signed-out notice while signed out.
 */
export function AuthenticatedModeShell({
  gate,
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
  if (signedIn) return children
  return (
    <div className={css.shell} data-auth-required="true">
      <IconUserOutlineRegular size={56} className={css.heroIcon} />
      <div className={css.title}>{title}</div>
      <div className={css.detail}>{detail}</div>
      <Button variant="primary" className={css.action} onClick={() => { gate.openSignInOverlay() }}>
        {actionLabel}
      </Button>
    </div>
  )
}
