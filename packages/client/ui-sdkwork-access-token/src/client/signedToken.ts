/**
 * Signed application access credentials for the access-token dialog.
 *
 * The committed `SDKWORK_ACCESS_TOKEN` of `APP_ACCESS_TOKEN_SPEC.md` §2 is a
 * public, forgeable isolation token: it must never carry a user identity or
 * authorize a protected operation. When a developer needs a credential that
 * *does* authorize app-api/backend-api calls, the platform issues one through
 * the authenticated exchange of §8: password login first, then
 * `appAccessTokens.create` for one installation. That credential is signed,
 * revocable, lasts one hour, and is never committed.
 *
 * This module owns the rules around that exchange and stays free of transport:
 * a {@link SdkworkIamAccessPort} supplies login, application listing, and the
 * exchange itself, so the security checks are testable without a network.
 */
import type { ClientEnvironment } from './accessToken.ts'
import { CLIENT_ENVIRONMENTS } from './accessToken.ts'
import type { SdkworkAccessTokenPrefill } from '../access-token-settings.ts'
import { messageOf } from './errors.ts'

/** Ownership modes an installation can declare (`APPLICATION_IDENTITY_SPEC.md` §4.1). */
export type ApplicationOwnershipScope = 'TENANT' | 'ORGANIZATION' | 'USER'

/** One authenticated SDKWork session the signed flow can use. */
export interface SdkworkSession {
  /** Gateway origin the session and the exchange run against. */
  baseUrl: string
  /** Session access token (`Access-Token` half). */
  accessToken: string
  /** Session auth token (`Authorization: Bearer` half). */
  authToken: string
  /** Refresh token, when the login returned one. */
  refreshToken?: string | undefined
  /** IAM user id of the signed-in account; the ownership filter key. */
  userId: string
  /** Account username, when known. */
  username?: string | undefined
  /** Session tenant, when the session reports one. */
  tenantId?: string | undefined
  /** Session organization, when the session reports one. */
  organizationId?: string | undefined
  /** Where the session came from: the mounted IAM service or this dialog's login. */
  source: 'current' | 'password'
}

/** One deploy application the signed-in user created. */
export interface MyApplication {
  /** IAM anchor (`deployApplicationId`) carried as the token `app_id`/`aud`. */
  anchor: string
  /** Deploy app uuid. */
  id: string
  name: string
  slug: string
  ownershipScope: ApplicationOwnershipScope
  ownerUserId?: string | undefined
  organizationId: string
  createdBy?: string | undefined
  status: string
}

/** One issued signed credential. */
export interface SignedAccessCredential {
  /** Signed access token (`Access-Token`). */
  accessToken: string
  /** Signed auth token (`Authorization: Bearer`), its required pair. */
  authToken: string
  /** Credential expiry instant. */
  expiresAt: string
  /** Anchor the credential names. */
  appId: string
  tenantApplicationId: string
  organizationId?: string | undefined
  ownershipScope: ApplicationOwnershipScope
  environment?: string | undefined
  sessionId?: string | undefined
  /** Decoded access-token payload, for the dialog's preview. */
  claims: Record<string, unknown>
}

/** Password-grant input for the gateway. */
export interface SdkworkLoginInput {
  baseUrl: string
  /** Public application token presented as the bootstrap `Access-Token`. */
  bootstrapAccessToken: string
  username: string
  password: string
}

/** One exchange request. */
export interface SdkworkExchangeRequest {
  /** Anchor of an application the signed-in user created. */
  appId: string
  environment: ClientEnvironment
}

/**
 * Transport seam of the signed flow. The shipped implementation calls the
 * generated SDKWork clients; tests provide a deterministic stub.
 */
export interface SdkworkIamAccessPort {
  /** Run the password grant and return the authenticated session. */
  login(input: SdkworkLoginInput): Promise<SdkworkSession>
  /** List the deploy applications visible to the session. */
  listApplications(session: SdkworkSession): Promise<MyApplication[]>
  /** Exchange the session for one installation's signed credential. */
  exchange(session: SdkworkSession, request: SdkworkExchangeRequest): Promise<SignedAccessCredential>
}

/** Gateway facts the dialog needs before it can offer the signed flow. */
export interface SdkworkGateway {
  /** Gateway origin, from the local config or the shared ui-sdkwork-env profile. */
  baseUrl: string
  /** Public application token presented as the bootstrap `Access-Token`. */
  bootstrapAccessToken: string
}

/** Decoded shape of one signed credential JWT. */
export interface DecodedSignedJwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

/**
 * Accounts whose login configuration is remembered in the DSH-home settings
 * section.
 *
 * Only service-style administrator/operator accounts qualify: `admin`,
 * `operator`, or a name that continues them with a digit or a `. _ + -`
 * separator (`admin01`, `operator.dev`, the local part of `admin@…`). An
 * ordinary user's password is never persisted by this dialog. The rule is
 * name-based because the session carries no role claim; a deployment that
 * names its privileged accounts differently can add the file by hand.
 */
const PRIVILEGED_ACCOUNT = /^(?:admin|operator)(?:$|[0-9._+-])/u

/**
 * Whether one account name is an admin/operator account.
 * @param account - username, e-mail, or any account string the gateway accepted.
 * @returns true when the account's local part is a privileged account.
 */
export function isPrivilegedAccount(account: string): boolean {
  const normalized = account.trim().toLowerCase()
  if (normalized === '') return false
  const at = normalized.indexOf('@')
  const local = at === -1 ? normalized : normalized.slice(0, at)
  return PRIVILEGED_ACCOUNT.test(local)
}

/** The maximum lifetime a fresh application credential may claim (one hour plus clock skew). */
const MAX_CREDENTIAL_LIFETIME_SECONDS = 60 * 60 + 300

/** Decode one base64url JWT segment as a JSON object. */
function decodeSegment(segment: string): unknown {
  const normalized = segment.replace(/-/gu, '+').replace(/_/gu, '/')
  const binary = globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('signed credential is not a JSON JWT payload')
  }
  return parsed
}

/**
 * Decode a signed credential without verifying its signature.
 *
 * Signature verification belongs to the platform's session service; this
 * decoder only proves the shape and supplies the claims the dialog shows. It
 * therefore refuses `alg: none`, which is the public isolation token's header
 * and must never be accepted here.
 * @param token - compact JWT.
 * @returns the header and payload.
 */
export function decodeSignedAccessToken(token: string): DecodedSignedJwt {
  const parts = token.trim().split('.')
  if (parts.length !== 3) throw new Error('signed access token is not a three-part JWT')
  let header: unknown
  let payload: unknown
  try {
    header = decodeSegment(parts[0] ?? '')
    payload = decodeSegment(parts[1] ?? '')
  } catch (error: unknown) {
    throw new Error(`signed access token is not a valid JWT: ${messageOf(error)}`)
  }
  if (typeof header !== 'object' || header === null) throw new Error('signed access token header is not an object')
  const headerRecord = header as Record<string, unknown>
  if (headerRecord.alg === 'none') {
    throw new Error('refusing an unsigned alg:none token on the signed credential path')
  }
  return { header: headerRecord, payload: payload as Record<string, unknown> }
}

/** Read one claim as text, tolerating numeric ids. */
function claimText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * Whether one listed application was created by the signed-in user.
 *
 * The platform's USER-release installations are owned by a user id; tenant and
 * organization applications record the creating user in `createdBy`. The deploy
 * service stores `createdBy` as the acting user id, but older rows may carry the
 * account name, so a supplied username is accepted as the same fact inside the
 * tenant the list is scoped to. The dialog offers only applications that satisfy
 * one of those facts, and the exchange re-checks it before issuing.
 * @param application - one listed deploy application.
 * @param userId - signed-in IAM user id.
 * @param username - signed-in account name, when known.
 * @returns true when the user created or solely owns the application.
 */
export function isOwnApplication(application: MyApplication, userId: string, username = ''): boolean {
  const me = userId.trim()
  if (me === '') return false
  const createdBy = (application.createdBy ?? '').trim()
  const account = username.trim()
  if (application.ownershipScope === 'USER' && (application.ownerUserId ?? '').trim() === me) return true
  return createdBy === me || (account !== '' && createdBy === account)
}

/**
 * Filter and sort the applications the signed-in user may generate tokens for.
 * @param applications - all applications the session can list.
 * @param userId - signed-in IAM user id.
 * @param username - signed-in account name, when known.
 * @returns own applications, name-sorted.
 */
export function ownApplications(
  applications: readonly MyApplication[], userId: string, username = '',
): MyApplication[] {
  return applications
    .filter(application => isOwnApplication(application, userId, username) && application.anchor.trim() !== '')
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Validate one issued credential against the request it answered.
 *
 * Fails closed on anything that would make the credential unusable or broader
 * than the selected application: the wrong anchor, a mismatched release scope,
 * a foreign owner on a USER release, an unsigned token, a lifetime beyond the
 * one-hour session class, or an already-expired credential.
 * @param credential - response from `appAccessTokens.create`.
 * @param expected - the application, session, and requested environment.
 * @returns the decoded claims after every check passed.
 */
export function validateSignedCredential(
  credential: SignedAccessCredential,
  expected: { application: MyApplication; session: SdkworkSession; environment: ClientEnvironment; now?: number },
): Record<string, unknown> {
  const { application, session } = expected
  if (credential.accessToken.trim() === '' || credential.authToken.trim() === '') {
    throw new Error('the exchange returned no complete credential pair')
  }
  if (credential.appId.trim() !== application.anchor.trim()) {
    throw new Error(
      `the exchange answered for app "${credential.appId}", not the selected "${application.anchor}"`,
    )
  }
  if (credential.ownershipScope !== application.ownershipScope) {
    throw new Error(
      `the credential release scope ${credential.ownershipScope} does not match the installation's ${application.ownershipScope}`,
    )
  }
  const own = isOwnApplication(application, session.userId, session.username)
  if (!own) throw new Error('the selected application was not created by the signed-in user')
  const decoded = decodeSignedAccessToken(credential.accessToken)
  const claims = decoded.payload
  if (claimText(claims.token_class) === 'application') {
    throw new Error('the exchange returned a public isolation token instead of a signed credential')
  }
  const anchor = claimText(claims.app_id)
  const audience = claimText(claims.aud)
  if (anchor !== application.anchor || audience !== application.anchor) {
    throw new Error(
      `the credential claims app_id=${anchor || '(none)'} aud=${audience || '(none)'}, `
      + `expected ${application.anchor}`,
    )
  }
  const tenantId = claimText(claims.tenant_id)
  if (session.tenantId !== undefined && session.tenantId !== '' && tenantId !== session.tenantId) {
    throw new Error(`the credential tenant_id=${tenantId || '(none)'} does not match the session tenant`)
  }
  const claimUserId = claimText(claims.user_id) || claimText(claims.sub)
  if (application.ownershipScope === 'USER' && claimUserId !== session.userId) {
    throw new Error(
      `a USER-release credential must name its owner; got user_id=${claimUserId || '(none)'}`,
    )
  }
  const now = expected.now ?? Math.floor(Date.now() / 1000)
  const exp = Number(claims.exp)
  if (!Number.isFinite(exp) || exp <= now) {
    throw new Error('the credential is already expired')
  }
  if (exp > now + MAX_CREDENTIAL_LIFETIME_SECONDS) {
    throw new Error('the credential lifetime exceeds the one-hour application credential class')
  }
  const expiresAt = Date.parse(credential.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('the exchange reported a missing or elapsed expiresAt')
  }
  if (credential.environment !== undefined && credential.environment !== ''
    && credential.environment !== expected.environment) {
    throw new Error(
      `the credential was gated on environment ${credential.environment}, not ${expected.environment}`,
    )
  }
  return claims
}

/** Read the IAM user id out of one signed access token, when it carries one. */
export function userIdOfToken(token: string): string {
  try {
    const { payload } = decodeSignedAccessToken(token)
    return claimText(payload.user_id) || claimText(payload.sub)
  } catch {
    return ''
  }
}

/**
 * Resolve the gateway facts for the signed flow.
 *
 * The remembered login wins over the shared environment profile, so a
 * project can pin its own deployment without changing the editor's settings.
 * @param config - local login configuration, when the project carries one.
 * @param env - current shared environment facts.
 * @returns the gateway origin and bootstrap token.
 */
export function resolveSdkworkGateway(
  config: SdkworkAccessTokenPrefill | undefined,
  env: { baseUrl: string; bootstrapAccessToken: string },
): SdkworkGateway {
  return {
    baseUrl: (config?.baseUrl ?? '').trim() || env.baseUrl.trim(),
    bootstrapAccessToken: (config?.bootstrapAccessToken ?? '').trim() || env.bootstrapAccessToken.trim(),
  }
}

/**
 * Resolve the form's initial login values from the workspace config.
 * @param config - local login configuration.
 * @returns the prefilled username/password (password may be empty).
 */
export function initialLoginValues(
  config: SdkworkAccessTokenPrefill | undefined,
): { username: string; password: string } {
  return { username: (config?.username ?? '').trim(), password: config?.password ?? '' }
}

/**
 * Validate the login form before it reaches the network, and name the missing
 * fact instead of letting the gateway answer a generic 401.
 * @param input - form values.
 * @param gateway - resolved gateway facts.
 * @returns nothing; throws when a required fact is missing.
 */
export function assertLoginInput(input: { username: string; password: string }, gateway: SdkworkGateway): void {
  if (gateway.baseUrl === '') throw new Error('the SDKWork gateway base URL is not configured')
  if (gateway.bootstrapAccessToken === '') {
    throw new Error('the bootstrap public application token (Access-Token) is not configured')
  }
  if (input.username.trim() === '') throw new Error('an account username or e-mail is required')
  if (input.password === '') throw new Error('an account password is required')
}

/**
 * Validate one exchange request before the network call.
 * @param application - selected application.
 * @param session - authenticated session.
 * @param environment - selected lifecycle.
 */
export function assertExchangeInput(
  application: MyApplication,
  session: SdkworkSession,
  environment: ClientEnvironment,
): void {
  if (!(CLIENT_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new Error(`environment=${environment} is not a lifecycle environment`)
  }
  if (!isOwnApplication(application, session.userId, session.username)) {
    throw new Error('only applications created by the signed-in user can be exchanged')
  }
  if (application.anchor.trim() === '') throw new Error('the selected application carries no IAM anchor')
}
