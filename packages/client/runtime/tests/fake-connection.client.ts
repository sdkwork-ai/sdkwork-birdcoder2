// Test-local ConnectionHandle double. The fork runtime still hands the merged
// connection loop its envelope sinks, which the upstream sink face dropped, so
// the captured sinks widen back to the fork's envelope-carrier face.
import type { ConnectionHandle, ConnectionSinks, RpcRequest } from '@deepseek-ai/dsh-client-connection/client'
import type { HostFrame, MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { FakeApiClient } from './fake-api.client.ts'

/** Fork envelope sinks alongside the merged upstream connection-state sinks. */
export interface RuntimeConnectionSinks extends ConnectionSinks {
  onMuxEnvelope?: (envelope: RpcRequest<MuxFrame>) => void
  onHostEnvelope?: (envelope: RpcRequest<HostFrame>) => void
}

/**
 * Stub ConnectionHandle whose start() captures the runtime's sinks.
 * @param api - fake API client exposed through the handle.
 * @param onSinks - receives the sinks the runtime passed to start().
 * @param onStop - called when the runtime's loop teardown stops the handle.
 * @returns the handle to provide as the `connection` service.
 */
export function fakeConnectionHandle(
  api: FakeApiClient,
  onSinks: (sinks: RuntimeConnectionSinks) => void,
  onStop: () => void = () => {},
): ConnectionHandle {
  return {
    api,
    isLoopback: true,
    generation: {
      getSnapshot: () => undefined,
      subscribe: () => () => {},
    },
    rpc: {
      call: () => Promise.reject(new Error('unexpected generic RPC call')),
    },
    registerGenerationSource: () => () => {},
    start: (sinks) => {
      onSinks(sinks as RuntimeConnectionSinks)
      return { stop: onStop }
    },
  }
}
