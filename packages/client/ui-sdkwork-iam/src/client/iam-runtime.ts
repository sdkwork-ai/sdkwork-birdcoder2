/**
 * The sdkwork-iam runtime adapter: the `SdkworkIamRuntimeAuthRuntimeLike`
 * the auth-pc-react controller and surfaces consume, backed directly by the
 * generated `@sdkwork/iam-app-sdk` client. The client unwraps the V3
 * envelope and throws on business-error codes, so the adapter only maps
 * method shapes and keeps the shared token manager in step with the durable
 * token store so the SDK transport always finds current credentials.
 */

import { createClient, type SdkworkAppClient } from '@sdkwork/iam-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import type {
  SdkworkIamRuntimeAuthRuntimeLike,
  SdkworkIamRuntimeAuthSessionLike,
} from '@sdkwork/auth-pc-react'
import type { AppbaseSessionCreateCommand } from '@sdkwork/iam-app-sdk'
import type { IamStoredSession, IamTokenStore } from './iam-token-store.ts'

export interface CreateIamAuthRuntimeOptions {
  /** The IAM app-api origin (non-empty by the time the runtime is created). */
  baseUrl: string
  /** The browser-local token store persisting the session across reloads. */
  tokenStore: IamTokenStore
  /** Shared token manager keeping the SDK client's transport credentials current. */
  tokenManager: AuthTokenManager
}

/**
 * Build the auth runtime over the generated app client.
 * @param options - base URL, durable token store, and the shared token manager.
 * @returns the runtime shape the sdkwork auth stack consumes.
 */
export function createIamAuthRuntime(options: CreateIamAuthRuntimeOptions): SdkworkIamRuntimeAuthRuntimeLike {
  const { tokenManager, tokenStore } = options
  const client: SdkworkAppClient = createClient({
    authMode: 'dual-token',
    baseUrl: options.baseUrl,
    platform: 'pc',
    tokenManager,
  })

  /** Sync the shared token manager from a durable session snapshot. */
  const syncTokenManager = (session: IamStoredSession): void => {
    if (session.accessToken || session.authToken || session.refreshToken) {
      tokenManager.setTokens({
        accessToken: session.accessToken,
        authToken: session.authToken,
        refreshToken: session.refreshToken,
      })
    }
  }

  // `sessions.create` and the OAuth session exchange carry generated
  // credential types; the runtime passes loose records built by
  // auth-pc-react for these exact endpoints, so the cast is the adapter
  // seam, not a shape invention.
  const asSessionCommand = (body: Record<string, unknown>): AppbaseSessionCreateCommand =>
    body

  // The generated refresh response types as a narrow command record, but
  // the endpoint returns the refreshed session (the iam-service reads the
  // same fields); the runtime shape needs the session view.
  const asSession = (value: unknown): Promise<SdkworkIamRuntimeAuthSessionLike> =>
    Promise.resolve(value as SdkworkIamRuntimeAuthSessionLike)

  return {
    contextStore: {
      clear: async () => {},
    },
    service: {
      auth: {
        passwordResetRequests: {
          create: body => client.auth.passwordResetRequests.create(body),
        },
        passwordResets: {
          create: body => client.auth.passwordResets.create(body),
        },
        registrations: {
          create: body => client.auth.registrations.create(body),
        },
        sessions: {
          create: body => client.auth.sessions.create(asSessionCommand(body)),
          refresh: body => asSession(client.auth.sessions.refresh(body)),
          current: {
            delete: () => client.auth.sessions.current.delete(),
            retrieve: () => client.auth.sessions.current.retrieve(),
            update: body => client.auth.sessions.current.update(body),
          },
          loginContextSelection: {
            create: body => client.auth.sessions.loginContextSelection.create(body),
          },
          organizationSelection: {
            create: body => client.auth.sessions.organizationSelection.create(body),
          },
        },
      },
      iam: {
        users: {
          current: {
            retrieve: () => client.iam.users.current.retrieve(),
          },
        },
      },
      oauth: {
        authorizationUrls: {
          create: (params = {}) => client.oauth.authorizationUrls.create(params),
        },
        authorizations: {
          completions: {
            create: (authorizationStateId, payload = {}) =>
              client.oauth.authorizations.completions.create(authorizationStateId, payload),
          },
        },
        deviceAuthorizations: {
          create: (payload = {}) => client.oauth.deviceAuthorizations.create(payload),
          passwordCompletions: {
            create: (deviceAuthorizationId, payload) =>
              client.oauth.deviceAuthorizations.passwordCompletions.create(deviceAuthorizationId, payload),
          },
          retrieve: deviceAuthorizationId =>
            client.oauth.deviceAuthorizations.retrieve(deviceAuthorizationId),
          scans: {
            create: (deviceAuthorizationId, payload = {}) =>
              client.oauth.deviceAuthorizations.scans.create(deviceAuthorizationId, payload),
          },
          sessionExchanges: {
            create: (deviceAuthorizationId, payload) =>
              client.oauth.deviceAuthorizations.sessionExchanges.create(deviceAuthorizationId, payload),
          },
        },
        providers: {
          list: () => client.oauth.providers.list(),
        },
        scanLoginModes: {
          list: () => client.oauth.scanLoginModes.list(),
        },
        sessions: {
          create: body => client.oauth.sessions.create(asSessionCommand(body)),
        },
      },
      system: {
        iam: {
          verificationPolicy: {
            retrieve: () => client.system.iam.verificationPolicy.retrieve(),
          },
        },
      },
    },
    tokenStore: {
      clear: async () => {
        await tokenStore.clear()
        tokenManager.clearTokens()
      },
      get: async () => {
        const session = await tokenStore.get()
        syncTokenManager(session)
        return session
      },
      set: async (session) => {
        await tokenStore.set(session)
        syncTokenManager(session)
      },
    },
  }
}
