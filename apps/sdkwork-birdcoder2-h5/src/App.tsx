import { AuthGate } from './AuthGate'
import type { AppRuntime } from './bootstrap/runtime'
import { AppRoutes } from './bootstrap/routes'

export interface AppProps {
  readonly runtime: AppRuntime
}

/** H5 root shell: AuthGate plus the route contributions owned by capability packages. */
export function App({ runtime }: AppProps) {
  return (
    <AuthGate runtime={runtime}>
      <AppRoutes runtime={runtime} />
    </AuthGate>
  )
}
