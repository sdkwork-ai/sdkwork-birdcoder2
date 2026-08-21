/**
 * Declaration facade for `@sdkwork/iam-app-sdk` — the generated client
 * surface the ui-sdkwork-iam runtime adapter consumes. The EMIT project resolves
 * this facade instead of the generated source; the TESTS project checks the
 * adapter against the real generated client. Keep the two in step.
 */

/** Loose operation command (most auth endpoints take one). */
export type AppbaseOperationCommand = Record<string, unknown>

/** Credential command for session create endpoints. */
export interface AppbaseSessionCreateCommand {
  email?: string
  username?: string
  phone?: string
  password?: string
  [key: string]: unknown
}

/** Client configuration. */
export interface SdkworkAppConfig {
  baseUrl: string
  authToken?: string
  accessToken?: string
  tenantId?: string
  organizationId?: string
  platform?: string
  tokenManager?: import('./sdk-common').AuthTokenManager
  timeout?: number
  authMode?: 'apikey' | 'dual-token'
  headers?: Record<string, string>
}

/** The generated app client face (methods the runtime adapter uses). */
export interface SdkworkAppClient {
  setAuthToken(token: string): this
  setAccessToken(token: string): this
  setTokenManager(manager: import('./sdk-common').AuthTokenManager): this
  auth: {
    passwordResetRequests: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    passwordResets: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    registrations: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    sessions: {
      create(body: AppbaseSessionCreateCommand): Promise<Record<string, unknown>>
      refresh(body: AppbaseOperationCommand): Promise<{ accepted: true; resourceId?: string; status?: string } & Record<string, unknown>>
      current: {
        delete(): Promise<void>
        retrieve(): Promise<Record<string, unknown>>
        update(body?: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
      loginContextSelection: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
      organizationSelection: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    }
  }
  iam: {
    users: {
      current: {
        retrieve(): Promise<Record<string, unknown>>
      }
    }
  }
  oauth: {
    authorizationUrls: { create(body: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    authorizations: {
      completions: {
        create(authorizationStateId: string, body?: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
    }
    deviceAuthorizations: {
      create(body?: AppbaseOperationCommand): Promise<Record<string, unknown>>
      passwordCompletions: {
        create(deviceAuthorizationId: string, body: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
      retrieve(deviceAuthorizationId: string): Promise<Record<string, unknown>>
      scans: {
        create(deviceAuthorizationId: string, body?: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
      sessionCompletions: {
        create(deviceAuthorizationId: string, body?: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
      sessionExchanges: {
        create(deviceAuthorizationId: string, body: AppbaseOperationCommand): Promise<Record<string, unknown>>
      }
    }
    providers: { list(params?: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    scanLoginModes: { list(params?: AppbaseOperationCommand): Promise<Record<string, unknown>> }
    sessions: { create(body: AppbaseSessionCreateCommand): Promise<Record<string, unknown>> }
  }
  system: {
    iam: {
      verificationPolicy: { retrieve(): Promise<Record<string, unknown>> }
    }
  }
}

export function createClient(config: SdkworkAppConfig): SdkworkAppClient
