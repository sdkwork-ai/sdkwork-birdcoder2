/**
 * Generated IAM backend client construction for the mini-program dialog.
 *
 * The mini-program account operations themselves live in
 * `@sdkwork/iam-pc-mini-program`; this module owns only the one transport seam
 * the harness must supply: a generated backend client bound to the active
 * gateway origin and the shared browser-global token manager.
 */
import { createClient, type SdkworkBackendClient } from '@sdkwork/iam-backend-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** Construction inputs for the generated IAM backend client. */
export interface MiniProgramBackendClientOptions {
  /** Normalized API gateway origin. */
  baseUrl: string
  /** Browser-global token manager the IAM session is mirrored into. */
  tokenManager: AuthTokenManager
}

/**
 * Build the generated IAM backend client the operator transport reads.
 * @param options - the gateway origin and the shared token manager.
 * @returns the generated backend client.
 */
export function createMiniProgramBackendClient(
  options: MiniProgramBackendClientOptions,
): SdkworkBackendClient {
  return createClient({
    authMode: 'dual-token',
    baseUrl: options.baseUrl,
    platform: 'pc',
    tokenManager: options.tokenManager,
  })
}
