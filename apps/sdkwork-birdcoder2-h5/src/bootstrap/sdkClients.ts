import { resolveBaseUrlWithAlignProtocol } from '@sdkwork/sdk-common'

import type { EnvironmentSelection } from './environment'

export interface SdkClients {
  readonly baseUrl: string
}

/**
 * H5 SDK client factory. Public base URLs load from the materialized runtime config before
 * construction and are aligned to the page protocol in one call
 * (`resolveBaseUrlWithAlignProtocol`). No secrets, no bare `http` calls in feature packages.
 */
export async function createSdkClients(_environment: EnvironmentSelection): Promise<SdkClients> {
  const baseUrl = resolveBaseUrlWithAlignProtocol({
    configured: import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL,
    fallback: '/',
  })
  return { baseUrl }
}
