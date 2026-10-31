import type { SecureStoragePort } from '../host/index.js'

/**
 * One global TokenManager backs every authenticated window of the tablet app.
 * Tokens and refresh tokens persist only through the tablet host secure-storage
 * adapter (iOS Keychain / Android Keystore), never Web storage or plain files
 * (APP_PAD_ARCHITECTURE_SPEC.md section 8).
 */
export interface TokenManagerBinding {
  readonly tokenManager: unknown
  readonly secureStorage: SecureStoragePort
}

export function assertSingleTokenManager(bindings: readonly TokenManagerBinding[]): void {
  if (bindings.length !== 1) {
    throw new Error(
      `tablet application must bind exactly one global TokenManager per authenticated session context, found ${bindings.length}`,
    )
  }
}

export function assertSecureStorage(binding: TokenManagerBinding): void {
  if (!binding.secureStorage) {
    throw new Error('tablet session requires the host secure-storage adapter')
  }
}
