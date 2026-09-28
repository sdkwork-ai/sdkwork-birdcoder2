import { createBirdCoder2PortsFromOptions, type BirdCoder2Ports } from '@sdkwork/birdcoder2-h5-core'
import { resolveBaseUrlWithAlignProtocol } from '@sdkwork/sdk-common'

import type { EnvironmentSelection } from './environment'
import type { TokenManager } from './tokenManager'

/** Everything the composition root hands to the capability providers. */
export interface SdkClients {
  /** Resolved public API origin, without the API prefix. */
  readonly baseUrl: string
  /** The capability ports; the only way a screen reaches the platform. */
  readonly ports: BirdCoder2Ports
}

/**
 * H5 SDK client factory.
 *
 * Two decisions live here and nowhere else:
 *
 * - The base URL is the **application origin**, not the API URL. The generated
 *   transport prepends its own `/app/v3/api` prefix (`appApiPath`), so passing a
 *   URL that already carries the prefix would produce `/app/v3/api/app/v3/api/...`.
 * - The scheme follows the page, because a phone reaching a dev edge over plain
 *   HTTP on the LAN cannot open an `https://` target
 *   (`ENVIRONMENT_SPEC.md` section 6.3). `resolveBaseUrlWithAlignProtocol` does
 *   both that and the deployment-mode selection in one call.
 *
 * A relative `/` fallback keeps a build with no materialised runtime config
 * same-origin rather than throwing at boot.
 */
export async function createSdkClients(
  environment: EnvironmentSelection,
  tokens: TokenManager,
): Promise<SdkClients> {
  const configured: unknown = import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
  const baseUrl = resolveBaseUrlWithAlignProtocol({
    baseUrls: typeof configured === 'string' && configured.trim().length > 0 ? configured : '/',
    mode: environment.deploymentProfile,
  }).url
  const ports = createBirdCoder2PortsFromOptions({ baseUrl, tokenManager: tokens })
  return { baseUrl, ports }
}
