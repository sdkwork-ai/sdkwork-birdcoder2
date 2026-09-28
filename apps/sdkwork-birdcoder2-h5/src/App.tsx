import { ConversationProvider } from '@sdkwork/birdcoder2-h5-agent-chat/state/conversationState'
import { HostsProvider } from '@sdkwork/birdcoder2-h5-hosts/state/hostsState'
import { BirdCoder2H5AppRoutes } from '@sdkwork/birdcoder2-h5-shell'

import { AuthGate } from './AuthGate'
import type { AppRuntime } from './bootstrap/runtime'

export interface AppProps {
  readonly runtime: AppRuntime
}

/**
 * H5 root shell.
 *
 * The capability providers are mounted here, above the router, and receive the
 * ports as a prop: that is what lets a capability screen read its state through
 * `useHosts()` / `useConversation()` without the capability package ever
 * importing a transport or a platform global. Providers are imported by
 * subpath so mounting them does not eagerly pull in their screens — the shell
 * still lazy-loads each route.
 *
 * Both providers read the fleet, so the first paint issues two list requests.
 * That is deliberate: each capability owns its own state, and sharing one cache
 * across capabilities would make a revoke by one invisible to the other.
 */
export function App({ runtime }: AppProps) {
  return (
    <AuthGate runtime={runtime}>
      <HostsProvider ports={runtime.sdk.ports}>
        <ConversationProvider ports={runtime.sdk.ports}>
          <BirdCoder2H5AppRoutes registry={runtime.registry} labels={runtime.labels} />
        </ConversationProvider>
      </HostsProvider>
    </AuthGate>
  )
}
