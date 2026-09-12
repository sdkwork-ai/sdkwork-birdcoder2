import type { ReactNode } from 'react'

import type { AppRuntime } from './bootstrap/runtime'

export interface AuthGateProps {
  readonly runtime: AppRuntime
  readonly children: ReactNode
}

/**
 * H5 authentication gate. Session state comes from the appbase IAM runtime created in
 * bootstrap; logout, refresh failure, tenant switch, and account switch must clear browser
 * storage, secure storage, the token manager, context stores, caches, and realtime bridges.
 */
export function AuthGate({ runtime, children }: AuthGateProps) {
  if (!runtime.iam.isAuthenticated()) {
    return <div data-testid="auth-gate-login" />
  }
  return <>{children}</>
}
