/**
 * Real transport of the signed flow: the generated IAM app client for the
 * password grant and the access-token exchange, and the generated deploy app
 * client for the caller's application list.
 *
 * Every call builds its own SDKWork client over a token manager primed with the
 * current session, so a rotated or discarded login can never leak into a later
 * call. Failures are flattened to one diagnostic sentence the dialog shows; no
 * token, password, or header value is ever included.
 */
import { createClient as createDeployClient } from '@sdkwork/deployments-app-sdk'
import { createClient as createIamClient } from '@sdkwork/iam-app-sdk'
import { createTokenManager } from '@sdkwork/sdk-common'
import type {
  MyApplication, SdkworkExchangeRequest, SdkworkIamAccessPort, SdkworkLoginInput, SdkworkSession,
  SignedAccessCredential, ApplicationOwnershipScope,
} from './signedToken.ts'
import { decodeSignedAccessToken, userIdOfToken } from './signedToken.ts'
import { messageOf } from './errors.ts'

/** Read one object member as a trimmed string. */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** Narrow one unknown value to a record. */
function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

/** Normalize one release scope, defaulting to the tenant mode. */
function ownershipScopeOf(value: unknown): ApplicationOwnershipScope {
  const normalized = text(value).toUpperCase()
  return normalized === 'ORGANIZATION' || normalized === 'USER' ? normalized : 'TENANT'
}

/** Build the SDKWork token manager for one session. */
function tokenManagerOf(session: SdkworkSession) {
  return createTokenManager({
    accessToken: session.accessToken,
    authToken: session.authToken,
    ...(session.refreshToken === undefined ? {} : { refreshToken: session.refreshToken }),
  })
}

/**
 * Sign in with the account password.
 *
 * The login route is a credential-entry route: it takes only the public
 * bootstrap `Access-Token`, never a session credential. The returned session
 * carries both transport halves, which the exchange needs.
 * @param input - gateway, bootstrap token, and credentials.
 * @returns the authenticated session.
 */
async function login(input: SdkworkLoginInput): Promise<SdkworkSession> {
  if (input.baseUrl === '') throw new Error('the SDKWork gateway base URL is not configured')
  if (input.bootstrapAccessToken === '') throw new Error('the bootstrap public application token is not configured')
  if (input.username.trim() === '' || input.password === '') {
    throw new Error('account and password are required for the password grant')
  }
  const bootstrap = createTokenManager({ accessToken: input.bootstrapAccessToken })
  const client = createIamClient({
    baseUrl: input.baseUrl,
    platform: 'pc',
    authMode: 'dual-token',
    tokenManager: bootstrap,
  })
  let raw: unknown
  try {
    raw = await client.auth.sessions.create({
      grantType: 'password',
      account: input.username.trim(),
      username: input.username.trim(),
      password: input.password,
    })
  } catch (error: unknown) {
    throw new Error(`SDKWork login failed: ${messageOf(error)}`)
  }
  const session = recordOf(raw)
  const accessToken = text(session.accessToken)
  const authToken = text(session.authToken)
  const refreshToken = text(session.refreshToken)
  if (accessToken === '' || authToken === '') {
    throw new Error('SDKWork login answered without a complete session credential pair')
  }
  const user = recordOf(session.user)
  const context = recordOf(session.context)
  const userId = text(user.id) || text(user.userId) || text(context.userId) || userIdOfToken(accessToken)
  if (userId === '') throw new Error('SDKWork login did not report the signed-in user id')
  return {
    baseUrl: input.baseUrl,
    accessToken,
    authToken,
    ...(refreshToken === '' ? {} : { refreshToken }),
    userId,
    ...(text(user.username) === '' ? {} : { username: text(user.username) }),
    ...(text(context.tenantId) === '' && text(user.tenantId) === ''
      ? {}
      : { tenantId: text(context.tenantId) || text(user.tenantId) }),
    ...(text(context.organizationId) === '' && text(user.organizationId) === ''
      ? {}
      : { organizationId: text(context.organizationId) || text(user.organizationId) }),
    source: 'password',
  }
}

/**
 * List the deploy applications of the session's tenant.
 * @param session - authenticated session.
 * @returns every listed application, mapped to the dialog's shape.
 */
async function listApplications(session: SdkworkSession): Promise<MyApplication[]> {
  const client = createDeployClient({
    baseUrl: session.baseUrl,
    platform: 'pc',
    authMode: 'dual-token',
    tokenManager: tokenManagerOf(session),
  })
  let page: { items?: ReadonlyArray<unknown> }
  try {
    page = await client.app.list({ pageSize: 200 })
  } catch (error: unknown) {
    throw new Error(`listing SDKWork applications failed: ${messageOf(error)}`)
  }
  return (page.items ?? []).map((item) => {
    const record = recordOf(item)
    return {
      anchor: text(record.deployApplicationId),
      id: text(record.id),
      name: text(record.name) || text(record.slug) || text(record.deployApplicationId),
      slug: text(record.slug),
      ownershipScope: ownershipScopeOf(record.ownershipScope ?? record.ownerType),
      ...(text(record.ownerUserId) === '' ? {} : { ownerUserId: text(record.ownerUserId) }),
      organizationId: text(record.organizationId) || '0',
      ...(text(record.createdBy) === '' ? {} : { createdBy: text(record.createdBy) }),
      status: text(record.appStatus) || 'UNKNOWN',
    }
  })
}

/**
 * Exchange the session for one installation's signed application credential.
 * @param session - authenticated session.
 * @param request - the application anchor and lifecycle.
 * @returns the issued credential with its decoded claims.
 */
async function exchange(
  session: SdkworkSession, request: SdkworkExchangeRequest,
): Promise<SignedAccessCredential> {
  const client = createIamClient({
    baseUrl: session.baseUrl,
    platform: 'pc',
    authMode: 'dual-token',
    tokenManager: tokenManagerOf(session),
  })
  let raw: unknown
  try {
    raw = await client.iam.appAccessTokens.create({
      appId: request.appId,
      environment: request.environment,
    })
  } catch (error: unknown) {
    throw new Error(`exchanging the application access token failed: ${messageOf(error)}`)
  }
  const record = recordOf(raw)
  const accessToken = text(record.accessToken)
  const authToken = text(record.authToken)
  if (accessToken === '' || authToken === '') {
    throw new Error('the exchange answered without a complete credential pair')
  }
  return {
    accessToken,
    authToken,
    expiresAt: text(record.expiresAt),
    appId: text(record.appId) || request.appId,
    tenantApplicationId: text(record.tenantApplicationId),
    ...(text(record.organizationId) === '' ? {} : { organizationId: text(record.organizationId) }),
    ownershipScope: ownershipScopeOf(record.ownershipScope),
    ...(text(record.environment) === '' ? {} : { environment: text(record.environment) }),
    ...(text(record.sessionId) === '' ? {} : { sessionId: text(record.sessionId) }),
    claims: decodeSignedAccessToken(accessToken).payload,
  }
}

/**
 * Build the shipped transport for the signed flow.
 * @returns the SDK-backed access port.
 */
export function createSdkworkIamAccessPort(): SdkworkIamAccessPort {
  return { login, listApplications, exchange }
}
