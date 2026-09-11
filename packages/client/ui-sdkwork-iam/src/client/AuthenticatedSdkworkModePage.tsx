/**
 * Shared signed-out / signed-in wrapper for SDKWork-backed mode pages. Keeps
 * the mode page marker on the outer shell and hands the sign-in policy to
 * {@link AuthenticatedModeShell}: an eager page swaps itself for the notice,
 * a deferred page renders either way and leaves the requirement to the
 * backend transport.
 */
import type { ReactNode } from 'react'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AuthenticatedModeShell, type SdkworkModeSignInPolicy } from './AuthenticatedModeShell.tsx'
import type { AuthenticatedModeGate } from './authenticated-mode.ts'

/** Injected IAM gate face for SDKWork-backed mode pages. */
export interface AuthenticatedSdkworkModePageInjected {
  /** Live IAM session face shared with the mode rail. */
  authGate: AuthenticatedModeGate
}

/** Everything a gated mode page owns regardless of its sign-in policy. */
export interface AuthenticatedSdkworkModePageBase extends AuthenticatedSdkworkModePageInjected {
  /** The active app mode id (also written to `data-mode-page`). */
  mode: AppModeId
  /** Outer page class name. */
  className?: string
  /** Optional extra `data-*` markers for assembled tests and telemetry. */
  dataAttributes?: Record<string, string>
  /** Signed-out heading copy; the eager policy requires it. */
  title?: string
  /** Signed-out supporting copy; the eager policy requires it. */
  detail?: string
  /** Signed-out sign-in button label; the eager policy requires it. */
  actionLabel?: string
  /** The SDKWork page tree. */
  children: ReactNode
}

/** Eager page: signed out it is replaced by the notice, so copy is required. */
export interface AuthenticatedSdkworkModePageEager extends AuthenticatedSdkworkModePageBase {
  /** State the requirement up front (the default). */
  signInPolicy?: 'eager'
  /** Signed-out heading copy. */
  title: string
  /** Signed-out supporting copy. */
  detail: string
  /** Signed-out sign-in button label. */
  actionLabel: string
}

/**
 * Deferred page: the product renders while signed out, so there is no notice
 * to write copy for. The requirement surfaces from the backend transport.
 */
export interface AuthenticatedSdkworkModePageDeferred extends AuthenticatedSdkworkModePageBase {
  /** Render the product before a session exists. */
  signInPolicy: 'deferred'
}

/** Props for {@link AuthenticatedSdkworkModePage}. */
export type AuthenticatedSdkworkModePageProps =
  | AuthenticatedSdkworkModePageEager
  | AuthenticatedSdkworkModePageDeferred

/**
 * Render a gated SDKWork mode page wrapped in the policy-appropriate chrome.
 * @param props - mode id, IAM gate, sign-in policy, and page children.
 * @returns the mode page shell.
 */
export function AuthenticatedSdkworkModePage(props: AuthenticatedSdkworkModePageProps) {
  const { mode, authGate, className, dataAttributes, signInPolicy, children } = props
  return (
    <div
      className={className}
      data-mode={mode}
      data-mode-page={mode}
      {...dataAttributes}
    >
      <AuthenticatedModeShell
        gate={authGate}
        policy={signInPolicy}
        title={props.title}
        detail={props.detail}
        actionLabel={props.actionLabel}
      >
        {children}
      </AuthenticatedModeShell>
    </div>
  )
}

/** Re-exported so pages can name the policy they pass. */
export type { SdkworkModeSignInPolicy }
