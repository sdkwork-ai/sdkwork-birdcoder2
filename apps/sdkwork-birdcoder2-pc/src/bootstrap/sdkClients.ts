import { resolveBaseUrlWithAlignProtocol } from '@sdkwork/sdk-common'

import type { EnvironmentSelection } from './environment'

export interface SdkClients {
  readonly baseUrl: string
}

/**
 * SDK client factory. Base URLs come from the materialized public runtime config
 * before any client is constructed, and are aligned to the page protocol in one
 * call (`resolveBaseUrlWithAlignProtocol`, APP_CLIENT_ARCHITECTURE_SPEC §6.3).
 *
 * Secrets never reach this layer: only public, non-secret build-time inputs are read.
 */
export async function createSdkClients(_environment: EnvironmentSelection): Promise<SdkClients> {
  const baseUrl = resolveBaseUrlWithAlignProtocol({
    configured: import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL,
    fallback: '/',
  })
  return { baseUrl }
}
