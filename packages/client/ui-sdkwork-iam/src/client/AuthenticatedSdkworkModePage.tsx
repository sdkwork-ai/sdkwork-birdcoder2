/**
 * Shared signed-out / signed-in wrapper for SDKWork-backed mode pages. Keeps
 * the mode page marker on the outer shell and swaps the page for the sign-in
 * notice while signed out, so a private surface states its requirement in
 * place instead of failing a request later.
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

/** Everything a gated mode page owns. */
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
  /** Signed-out sign-in button label. */
  actionLabel: string
  /** The SDKWork page tree. */
  children: ReactNode
}

/**
 * Render a gated SDKWork mode page behind the sign-in requirement.
 * @param props - mode id, IAM gate, signed-out copy, and page children.
 * @returns the mode page shell.
 */
export function AuthenticatedSdkworkModePage(props: AuthenticatedSdkworkModePageProps) {
  const { mode, authGate, className, dataAttributes, title, detail, actionLabel, children } = props
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
