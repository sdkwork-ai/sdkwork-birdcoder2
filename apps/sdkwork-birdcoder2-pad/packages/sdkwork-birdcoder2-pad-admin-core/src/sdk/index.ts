/**
 * Backend SDK wrapper surface for the `backend-admin` boundary.
 *
 * Placeholder types keep the boundary explicit until generated backend SDK
 * clients are injected; this package owns the only backend SDK exports in the
 * tablet root (APP_PAD_ARCHITECTURE_SPEC.md section 8).
 */
export interface BackendAdminSdkClients {
  readonly backendApi: unknown
  readonly appbaseBackendApi: unknown
}

export type BackendAdminSdkClientFactory = (config: {
  readonly baseUrl: string
  readonly applicationCode: string
}) => Promise<BackendAdminSdkClients>
