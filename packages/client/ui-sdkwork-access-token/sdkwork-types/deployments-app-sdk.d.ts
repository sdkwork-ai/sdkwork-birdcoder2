/**
 * Declaration facade for `@sdkwork/deployments-app-sdk`: the application list
 * this package reads to find the signed-in user's own applications. The emit
 * program resolves these declarations so the sdkwork sibling source never
 * enters the typecheck/declaration machinery; the bundle resolves the real
 * package.
 */
import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** Generated client configuration. */
export interface SdkworkDeployAppConfig {
  baseUrl: string
  authToken?: string
  accessToken?: string
  tenantId?: string
  organizationId?: string
  platform?: string
  tokenManager?: AuthTokenManager
  timeout?: number
  authMode?: 'apikey' | 'dual-token'
  headers?: Record<string, string>
}

/** Application list query. */
export interface AppListParams {
  page?: number
  pageSize?: number
  keyword?: string
  ownershipScope?: string
  scope?: string
  ownerOrganizationId?: string
  appKind?: string[]
}

/** Application list answer; only the page items are read here. */
export interface AppListResponse {
  items: ReadonlyArray<unknown>
  pageInfo: unknown
}

/** Generated authenticated client surface this package uses. */
export interface SdkworkDeployAppClient {
  app: {
    list(params?: AppListParams): Promise<AppListResponse>
  }
}

/** Create the generated client. */
export declare function createClient(config: SdkworkDeployAppConfig): SdkworkDeployAppClient
