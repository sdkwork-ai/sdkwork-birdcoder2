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
 * The resolver takes a `baseUrls` candidate list plus the deployment mode and
 * returns a `BaseUrlResolution`: the selected origin is its `url`. A relative `/`
 * fallback keeps a build with no materialized runtime config same-origin instead
 * of throwing at boot.
 *
 * Secrets never reach this layer: only public, non-secret build-time inputs are read.
 */
export async function createSdkClients(environment: EnvironmentSelection): Promise<SdkClients> {
  const configured: unknown = import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
  const baseUrl = resolveBaseUrlWithAlignProtocol({
    baseUrls: typeof configured === 'string' && configured.trim().length > 0 ? configured : '/',
    mode: environment.deploymentProfile,
  }).url
  return { baseUrl }
}
