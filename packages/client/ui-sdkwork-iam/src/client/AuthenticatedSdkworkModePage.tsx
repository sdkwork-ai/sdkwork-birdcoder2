/**
 * Shared signed-out / signed-in wrapper for SDKWork-backed mode pages. Keeps
 * the mode page marker on the outer shell while {@link AuthenticatedModeShell}
 * blocks the embedded surface until IAM reports a session.
 */
import type { ReactNode } from 'react'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AuthenticatedModeShell } from './AuthenticatedModeShell.tsx'
import type { AuthenticatedModeGate } from './authenticated-mode.ts'

/** Injected IAM gate face for SDKWork-backed mode pages. */
export interface AuthenticatedSdkworkModePageInjected {
  /** Live IAM session face shared with the mode rail. */
  authGate: AuthenticatedModeGate
}

/** Props for {@link AuthenticatedSdkworkModePage}. */
export interface AuthenticatedSdkworkModePageProps extends AuthenticatedSdkworkModePageInjected {
  /** The active app mode id (also written to `data-mode-page`). */
  mode: AppModeId
  /** Outer page class name. */
  className?: string
  /** Optional extra `data-*` markers for assembled tests and telemetry. */
  dataAttributes?: Record<string, string>
  /** Signed-out heading copy. */
  title: string
  /** Signed-out supporting copy. */
  detail: string
  /** Signed-out retry button label. */
  actionLabel: string
  /** The authenticated SDKWork page tree. */
  children: ReactNode
}

/**
 * Render a gated SDKWork mode page with consistent signed-out chrome.
 * @param props - mode id, IAM gate, copy, and authenticated children.
 * @returns the mode page shell.
 */
export function AuthenticatedSdkworkModePage({
  mode,
  authGate,
  className,
  dataAttributes,
  title,
  detail,
  actionLabel,
  children,
}: AuthenticatedSdkworkModePageProps) {
  return (
    <div
      className={className}
      data-mode={mode}
      data-mode-page={mode}
      {...dataAttributes}
    >
      <AuthenticatedModeShell
        gate={authGate}
        title={title}
        detail={detail}
        actionLabel={actionLabel}
      >
        {children}
      </AuthenticatedModeShell>
    </div>
  )
}
