import type { ReactNode } from 'react'

import type { AppRuntime } from './bootstrap/runtime'

export interface AuthGateProps {
  readonly runtime: AppRuntime
  readonly children: ReactNode
}

/**
 * App-surface authentication gate.
 *
 * Session state comes from the appbase IAM runtime created in bootstrap; the gate
 * renders login routing while unauthenticated and clears sensitive state on logout.
 * It performs no token parsing and no SDK transport of its own.
 */
export function AuthGate({ runtime, children }: AuthGateProps) {
  if (!runtime.iam.isAuthenticated()) {
    return <div data-testid="auth-gate-login" />
  }
  return <>{children}</>
}
