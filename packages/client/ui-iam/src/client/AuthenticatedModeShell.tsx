/**
 * Signed-out shell for SDKWork-backed mode pages: opens the modal sign-in
 * overlay when the page first mounts unsigned, keeps a retry CTA after the
 * user dismisses the overlay, and mounts children only after IAM reports
 * signed in so those surfaces never run anonymous SDK traffic.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
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
 * button that re-opens the overlay.
 * @param props - gate, copy, and the authenticated page tree.
 * @returns the signed-in children or the signed-out notice.
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
  useEffect(() => {
    if (!signedIn) gate.openSignInOverlay()
  }, [signedIn, gate])
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
