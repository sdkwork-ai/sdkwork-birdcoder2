/**
 * Application-owned app SDK factory surface.
 *
 * UI and capability packages receive constructed clients by injection. They
 * must not construct SDK clients, raw HTTP clients, or manual auth headers
 * (APP_PAD_ARCHITECTURE_SPEC.md section 8). Backend SDK wrappers are deliberately
 * absent: they belong to `@sdkwork/birdcoder2-pad-admin-core`.
 */
export interface AppSdkClientConfig {
  readonly baseUrl: string
  readonly applicationCode: string
}

export interface AppSdkClients {
  readonly appApi: unknown
  readonly appbaseAppApi: unknown
}

export type AppSdkClientFactory = (config: AppSdkClientConfig) => Promise<AppSdkClients>
