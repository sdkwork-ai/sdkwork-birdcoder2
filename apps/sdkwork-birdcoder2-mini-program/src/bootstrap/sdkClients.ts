import type { EnvironmentSelection } from './environment'

export interface SdkClients {
  readonly baseUrl: string
}

/**
 * Mini program SDK client factory. Generated app SDK clients or approved wrappers are
 * injected here; feature packages must not use raw request APIs or manual auth headers.
 */
export function createSdkClients(_environment: EnvironmentSelection): SdkClients {
  const configured = String(SDKWORK_RUNTIME_ENV?.SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL ?? '').trim()
  return { baseUrl: configured || '/' }
}

declare const SDKWORK_RUNTIME_ENV:
  | { readonly SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL?: string }
  | undefined
