import { AuthGate } from './AuthGate'
import type { AppRuntime } from './bootstrap/runtime'
import { AppRoutes } from './bootstrap/routes'

export interface AppProps {
  readonly runtime: AppRuntime
}

/**
 * Root shell. Registers the AuthGate and mounts the route contributions owned by
 * the capability packages; it renders no business screen itself.
 */
export function App({ runtime }: AppProps) {
  return (
    <AuthGate runtime={runtime}>
      <AppRoutes runtime={runtime} />
    </AuthGate>
  )
}
