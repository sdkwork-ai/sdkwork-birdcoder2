/**
 * Declaration facade for `@sdkwork/auth-pc-react` — the surface the ui-iam
 * plugin consumes. The EMIT project resolves this facade instead of the
 * sdkwork source (whose closure cannot be emitted portably); the TESTS
 * project type-checks the plugin against the REAL package source and is the
 * drift guard for this file. Keep the two in step.
 */

import type { ReactNode } from 'react'

/** Stored-session subset the auth stack persists. */
export interface SdkworkIamRuntimeAuthStoredSessionLike {
  accessToken?: string
  authToken?: string
  expiresAt?: number | string
  refreshToken?: string
}

/** Loose user record the runtime produces. */
export interface SdkworkIamRuntimeAuthUserLike {
  avatar?: unknown
  displayName?: unknown
  email?: unknown
  firstName?: unknown
  id?: unknown
  lastName?: unknown
  name?: unknown
  nickname?: unknown
  userId?: unknown
  username?: unknown
}

/** Loose session record the runtime produces. */
export interface SdkworkIamRuntimeAuthSessionLike extends SdkworkIamRuntimeAuthStoredSessionLike {
  context?: unknown
  sessionId?: string
  user?: SdkworkIamRuntimeAuthUserLike
}

/** QR/login helpers the runtime exposes (loose records). */
export interface SdkworkIamRuntimeQrAuthSessionLike {
  status?: string
  session?: SdkworkIamRuntimeAuthSessionLike
  user?: SdkworkIamRuntimeAuthUserLike
  [key: string]: unknown
}

/** The runtime shape the controller and auth surfaces consume. */
export interface SdkworkIamRuntimeAuthRuntimeLike {
  contextStore?: {
    clear?: () => Promise<void> | void
  }
  service: {
    auth: {
      passwordResetRequests: {
        create(body: Record<string, unknown>): Promise<unknown>
      }
      passwordResets: {
        create(body: Record<string, unknown>): Promise<unknown>
      }
      registrations: {
        create(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
      }
      sessions: {
        create(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
        current: {
          delete(): Promise<void>
          retrieve(): Promise<SdkworkIamRuntimeAuthSessionLike>
          update?(body?: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
        }
        loginContextSelection?: {
          create?(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
        }
        organizationSelection?: {
          create?(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
        }
        refresh?(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
      }
    }
    oauth?: {
      providers?: {
        list?(): Promise<unknown>
      }
      scanLoginModes?: {
        list?(): Promise<unknown>
      }
      authorizationUrls?: {
        create?(params?: Record<string, unknown>): Promise<unknown>
      }
      sessions?: {
        create?(body: Record<string, unknown>): Promise<SdkworkIamRuntimeAuthSessionLike>
      }
      deviceAuthorizations?: {
        create?(payload?: Record<string, unknown>): Promise<SdkworkIamRuntimeQrAuthSessionLike | unknown>
        retrieve?(deviceAuthorizationId: string): Promise<SdkworkIamRuntimeQrAuthSessionLike | unknown>
        passwordCompletions?: {
          create?(
            deviceAuthorizationId: string,
            payload: Record<string, unknown>,
          ): Promise<SdkworkIamRuntimeQrAuthSessionLike | unknown>
        }
        scans?: {
          create?(
            deviceAuthorizationId: string,
            payload?: Record<string, unknown>,
          ): Promise<SdkworkIamRuntimeQrAuthSessionLike | unknown>
        }
        sessionExchanges?: {
          create?(
            deviceAuthorizationId: string,
            payload: Record<string, unknown>,
          ): Promise<unknown>
        }
      }
      authorizations?: {
        completions?: {
          create?(
            authorizationStateId: string,
            payload?: Record<string, unknown>,
          ): Promise<unknown>
        }
      }
    }
    system?: {
      iam?: {
        verificationPolicy?: {
          retrieve?(): Promise<unknown>
        }
      }
    }
    iam: {
      users: {
        current: {
          retrieve(): Promise<SdkworkIamRuntimeAuthUserLike>
        }
      }
    }
  }
  tokenStore?: {
    clear?: () => Promise<void> | void
    get?: () =>
      | Promise<SdkworkIamRuntimeAuthStoredSessionLike>
      | SdkworkIamRuntimeAuthStoredSessionLike
    set?: (session: SdkworkIamRuntimeAuthStoredSessionLike) => Promise<void> | void
  }
}

/** Normalized user in controller state. */
export interface SdkworkAuthUser {
  avatar?: unknown
  displayName?: string
  email?: string
  id?: string
  nickname?: string
  username?: string
}

/** Normalized session in controller state. */
export interface SdkworkAuthSession {
  accessToken: string
  authToken: string
  context?: unknown
  expiresAt?: number | string
  refreshToken?: string
  sessionId?: string
  user?: SdkworkAuthUser
}

/** The controller's published state. */
export interface SdkworkAuthControllerState {
  isAuthenticated: boolean
  isBootstrapped: boolean
  isBusy: boolean
  lastError?: string
  session: SdkworkAuthSession | null
  status: 'anonymous' | 'authenticated' | 'authenticating'
  user: SdkworkAuthUser | null
}

/** The auth controller face. */
export interface SdkworkAuthController {
  applySession(session: SdkworkAuthSession): void
  bootstrap(): Promise<SdkworkAuthControllerState>
  getState(): SdkworkAuthControllerState
  register(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  requestPasswordReset(input: Record<string, unknown>): Promise<void>
  resetPassword(input: Record<string, unknown>): Promise<void>
  refreshSession(input?: Record<string, unknown>): Promise<SdkworkAuthSession>
  sendVerifyCode(input: Record<string, unknown>): Promise<void>
  signIn(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  signInWithEmailCode(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  signInWithOAuth(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  signInWithPhoneCode(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  signInWithSessionBridge(input: Record<string, unknown>): Promise<SdkworkAuthSession>
  signOut(): Promise<void>
  subscribe(listener: () => void): () => void
  verifyCode(input: Record<string, unknown>): Promise<boolean>
}

/** Auth-surface runtime configuration. */
export interface SdkworkAuthRuntimeConfig {
  developmentPrefill?: Record<string, unknown>
  leftRailMode?: 'auto' | 'highlights-only' | 'qr-only'
  loginMethods?: readonly string[]
  oauthLoginEnabled?: boolean
  oauthProviderRegion?: string
  oauthProviders?: readonly string[]
  qrLoginEnabled?: boolean
  recoveryMethods?: readonly string[]
  registerMethods?: readonly string[]
  verificationPolicy?: {
    emailCodeLoginEnabled?: boolean
    emailRegistrationVerificationRequired?: boolean
    oauthLoginEnabled?: boolean
    phoneCodeLoginEnabled?: boolean
    phoneRegistrationVerificationRequired?: boolean
  }
}

/** Appearance customization contract (accepted as-is by the surfaces). */
export interface SdkworkAuthAppearanceConfig {
  [key: string]: unknown
}

/** The sdkwork appearance presets (light 'sdkwork', dark 'midnight', ...). */
export type SdkworkAuthAppearancePreset = 'sdkwork' | 'midnight' | 'paper' | 'standard'

export function createSdkworkAuthAppearancePreset(preset?: SdkworkAuthAppearancePreset): SdkworkAuthAppearanceConfig

export interface CreateSdkworkIamRuntimeAuthControllerOptions {
  initialState?: Partial<SdkworkAuthControllerState>
  methodUnavailableMessage?: string
  getRuntime: () =>
    | Promise<SdkworkIamRuntimeAuthRuntimeLike>
    | SdkworkIamRuntimeAuthRuntimeLike
}

export function createSdkworkIamRuntimeAuthController(
  options: CreateSdkworkIamRuntimeAuthControllerOptions,
): SdkworkAuthController

/** The auth page's full props. */
export interface SdkworkAuthPageProps {
  appearance?: SdkworkAuthAppearanceConfig
  basePath?: string
  controller?: SdkworkAuthController
  events?: Record<string, unknown>
  homePath?: string
  onAuthComplete?: () => void
  onDismiss?: () => void
  presentation?: 'page' | 'modal'
  runtimeConfig?: SdkworkAuthRuntimeConfig
  slots?: Record<string, unknown>
}

export function SdkworkAuthPage(props: SdkworkAuthPageProps): ReactNode

/** The modal login/register surface's full props. */
export interface SdkworkSessionAuthLoginModalProps {
  appearance?: SdkworkAuthAppearanceConfig
  authLoginPath?: string
  basePath?: string
  controller?: SdkworkAuthController
  controllerOptions?: Omit<CreateSdkworkIamRuntimeAuthControllerOptions, 'getRuntime'>
  copy?: Record<string, string>
  events?: Record<string, unknown>
  getRuntime?: () =>
    | Promise<SdkworkIamRuntimeAuthRuntimeLike>
    | SdkworkIamRuntimeAuthRuntimeLike
  homePath?: string
  locale?: string | null
  methodUnavailableMessage?: string
  onAuthComplete(): void
  onDismiss(): void
  returnPath: string
  runtimeConfig?: SdkworkAuthRuntimeConfig
  slots?: Record<string, unknown>
}

export function SdkworkSessionAuthLoginModal(props: SdkworkSessionAuthLoginModalProps): ReactNode

/** The auth copy catalog (opaque to consumers). */
export interface SdkworkMessageCatalog {
  defaultLocale?: string
  locales?: Record<string, unknown>
  namespace?: string
}

export const SDKWORK_AUTH_I18N_CATALOG: SdkworkMessageCatalog
