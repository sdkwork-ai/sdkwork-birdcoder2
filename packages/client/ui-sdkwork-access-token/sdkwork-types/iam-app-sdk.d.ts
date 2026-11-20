/**
 * Declaration facade for `@sdkwork/iam-app-sdk`: the login and application
 * access-token exchange calls this package makes. The emit program resolves
 * these declarations so the sdkwork sibling source never enters the
 * typecheck/declaration machinery; the bundle resolves the real package.
 */
import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** Generated client configuration. */
export interface SdkworkAppConfig {
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

/** Password-grant body the credential-entry session route accepts. */
export interface AppbaseSessionCreateCommand {
  grantType?: 'password' | 'phone_code' | 'email_code'
  account?: string
  email?: string
  username?: string
  phone?: string
  password?: string
  deviceId?: string
}

/** Application access-token exchange request. */
export interface IamAppAccessTokenCreateCommand {
  appId?: string
  tenantApplicationId?: string
  instanceKey?: string
  environment?: 'development' | 'test' | 'staging' | 'demo' | 'production'
  ownershipScope?: 'TENANT' | 'ORGANIZATION' | 'USER'
}

/** Generated authenticated client surface this package uses. */
export interface SdkworkAppClient {
  auth: {
    sessions: {
      create(body: AppbaseSessionCreateCommand): Promise<Record<string, unknown>>
    }
  }
  iam: {
    appAccessTokens: {
      create(body: IamAppAccessTokenCreateCommand): Promise<Record<string, unknown>>
    }
  }
}

/** Create the generated client. */
export declare function createClient(config: SdkworkAppConfig): SdkworkAppClient
