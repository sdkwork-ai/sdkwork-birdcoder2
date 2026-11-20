/**
 * Public application access token generator for SDKWork client env profiles.
 *
 * Implements `APP_ACCESS_TOKEN_SPEC.md` §3 in the browser: a three-part JWT
 * compact serialization with `alg: none`, `kid: public-app-token`, and
 * `token_class: application`. The value is SaaS-isolation material, not a
 * secret, and is committed to the application root's per-scope env file. The
 * builder is deterministic — the same identity, profile, and generation
 * instants always produce the same string — so re-initializing an unchanged
 * application rewrites nothing.
 */

import { messageOf } from './errors.ts'

/** Env key that carries the public application access token (`APP_ACCESS_TOKEN_SPEC.md` §2). */
export const PUBLIC_APP_ACCESS_TOKEN_KEY = 'SDKWORK_ACCESS_TOKEN'

/** JWT header `kid` of the public application token. */
export const PUBLIC_APP_ACCESS_TOKEN_KID = 'public-app-token'

/** Contract version claim; bumping it is an explicit rotation. */
export const PUBLIC_APP_ACCESS_TOKEN_VERSION = 1

/** Issuer of the public application token. */
export const PUBLIC_APP_ACCESS_TOKEN_ISSUER = 'sdkwork-iam-public'

/** The signature segment is the literal `public`; it is never verified with a key. */
export const PUBLIC_APP_ACCESS_TOKEN_SIGNATURE = 'public'

/**
 * Fixed generation instant (`2026-01-01T00:00:00Z`). It keeps an unchanged
 * application byte-identical across regenerations; rotation is explicit.
 */
export const PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT = Math.floor(Date.UTC(2026, 0, 1) / 1000)

/**
 * The `exp` value of a permanent token: `0` means "never expires"
 * (`APP_ACCESS_TOKEN_SPEC.md` §3, `sdkwork-iam`
 * `APPLICATION_ACCESS_TOKEN_NO_EXPIRY`).
 *
 * The token ships inside the packaged application and is SaaS-isolation
 * material, not a session credential, so its default lifetime is unbounded: a
 * shipped build cannot renew a credential it never kept. An explicit
 * `expiresAt` opts into a time-boxed rotation window instead.
 */
export const PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY = 0

/**
 * Whether one `exp` claim means "never expires".
 *
 * Both the sentinel `0` and an absent claim are permanent, matching the server
 * contract; any other finite value is a rotation deadline.
 * @param value - decoded `exp` claim, when present.
 * @returns true when the token never expires.
 */
export function isApplicationAccessTokenExpiryPermanent(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'number' && Number.isFinite(value) && value === PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY
}

/** Lifecycle environments of the profile matrix (`ENVIRONMENT_SPEC.md` §5.1). */
export const CLIENT_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const

/** Deployment profiles of the profile matrix. */
export const CLIENT_DEPLOYMENT_PROFILES = ['standalone', 'cloud'] as const

/** One profile environment. */
export type ClientEnvironment = typeof CLIENT_ENVIRONMENTS[number]

/** One deployment profile. */
export type ClientDeploymentProfile = typeof CLIENT_DEPLOYMENT_PROFILES[number]

/** Token scope: tenant-level (`organization_id = 0`) or organization-level (non-zero). */
export type AccessTokenLevel = 'tenant' | 'organization'

/** Release scope claim value (`APPLICATION_IDENTITY_SPEC.md` §4.1). */
export type OwnershipScope = 'TENANT' | 'ORGANIZATION'

/** Runtime targets a surface may declare (`CONFIG_SPEC.md`, `APP_RUNTIME_TOPOLOGY_NAMING.md`). */
export const RUNTIME_TARGETS = [
  'browser', 'desktop', 'tablet-ipados', 'tablet-android', 'capacitor-ios', 'capacitor-android',
  'flutter-ios', 'flutter-android', 'android-native', 'ios-native', 'harmony-native', 'mini-program',
  'server', 'container', 'test-runner',
] as const

/** One runtime target. */
export type RuntimeTarget = typeof RUNTIME_TARGETS[number]

/** One application identity and profile pair, independent of the token level. */
export interface AccessTokenIdentity {
  /** Deployment application anchor, or the root manifest `backend.appId`. */
  appId: string
  /** Root manifest `backend.tenantId`; a positive decimal IAM tenant id. */
  tenantId: string
  /** Root manifest `backend.organizationId`; non-zero only for organization-level tokens. */
  organizationId: string
  /** Permission scope claim; the default is the bootstrap `iam:self`. */
  permissionScope?: readonly string[] | undefined
}

/** One profile file's identity: deployment profile plus lifecycle environment. */
export interface AccessTokenProfile {
  deploymentProfile: ClientDeploymentProfile
  environment: ClientEnvironment
}

/** Everything one generated token needs. */
export interface AccessTokenBuildOptions {
  identity: AccessTokenIdentity
  profile: AccessTokenProfile
  /** Surface runtime target the token names. */
  runtimeTarget: RuntimeTarget
  /** Permission scope override; defaults to the identity's scope, then `iam:self`. */
  permissionScope?: readonly string[] | undefined
  /** Token level; derived from `identity.organizationId` when omitted. */
  level?: AccessTokenLevel | undefined
  /** Explicit `session_id`; derived from the identity and profile when omitted. */
  sessionId?: string | undefined
  /** Rotation instant override (seconds); defaults to the fixed generation instant. */
  issuedAt?: number | undefined
  /** Explicit rotation deadline (seconds); omitted keeps the token permanent. */
  expiresAt?: number | undefined
}

/** Decoded header and payload of one public application token. */
export interface DecodedPublicApplicationAccessToken {
  header: { alg: string; kid: string; typ: string }
  payload: Record<string, unknown> & {
    app_id?: unknown
    aud?: unknown
    login_scope?: unknown
    organization_id?: unknown
    ownership_scope?: unknown
    tenant_id?: unknown
    user_id?: unknown
  }
}

/** Profile id of the profile matrix: `<deployment-profile>.<environment>`. */
export interface ClientProfileId {
  profileId: string
  deploymentProfile: ClientDeploymentProfile
  environment: ClientEnvironment
}

/**
 * Build the profile matrix ids in the canonical order.
 * @returns the ten profile ids, standalone before cloud, environment in lifecycle order.
 */
export function clientProfileIds(): ClientProfileId[] {
  return CLIENT_DEPLOYMENT_PROFILES.flatMap(deploymentProfile =>
    CLIENT_ENVIRONMENTS.map(environment => ({
      profileId: `${deploymentProfile}.${environment}`,
      deploymentProfile,
      environment,
    })))
}

/**
 * Render one profile id.
 * @param profile - deployment profile and environment.
 * @returns `<deployment-profile>.<environment>`.
 */
export function profileIdOf(profile: AccessTokenProfile): string {
  return `${profile.deploymentProfile}.${profile.environment}`
}

/**
 * Parse one profile id back into its parts.
 * @param profileId - a `<deployment-profile>.<environment>` id.
 * @returns the parsed profile, or undefined for an unsupported id.
 */
export function parseClientProfileId(profileId: string): ClientProfileId | undefined {
  const parts = profileId.trim().split('.')
  if (parts.length !== 2) return undefined
  const [deploymentProfile, environment] = parts as [string, string]
  if (!(CLIENT_DEPLOYMENT_PROFILES as readonly string[]).includes(deploymentProfile)) return undefined
  if (!(CLIENT_ENVIRONMENTS as readonly string[]).includes(environment)) return undefined
  return {
    profileId,
    deploymentProfile: deploymentProfile as ClientDeploymentProfile,
    environment: environment as ClientEnvironment,
  }
}

/**
 * Deployment mode of one deployment profile: standalone is private, cloud is SaaS.
 * @param deploymentProfile - the profile's deployment class.
 * @returns `private` or `saas`.
 */
export function deploymentModeOf(deploymentProfile: ClientDeploymentProfile): 'private' | 'saas' {
  return deploymentProfile === 'cloud' ? 'saas' : 'private'
}

/** UTF-8 JSON to an unpadded base64url segment. */
function base64urlJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** Decode one base64url segment as UTF-8 text. */
function decodeBase64urlJson(segment: string): unknown {
  const normalized = segment.replace(/-/gu, '+').replace(/_/gu, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Require a non-blank, trimmed text value. */
function requireText(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized === '') throw new Error(`${label} is required to initialize a public application access token.`)
  return normalized
}

/** Require a positive decimal IAM subject id. */
function requireDecimalId(value: unknown, label: string): string {
  const normalized = requireText(value, label)
  if (!/^[1-9][0-9]*$/u.test(normalized)) {
    throw new Error(`${label} must be a positive decimal id, got "${normalized}".`)
  }
  return normalized
}

/** Render one claim value for a diagnostic or the dialog preview. */
function claimText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return value === undefined || value === null ? '' : JSON.stringify(value)
}

/** Failed `ownership_scope` normalization is a hard error, never a default. */
function normalizeOwnershipScope(value: unknown, label: string): OwnershipScope {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (normalized !== 'TENANT' && normalized !== 'ORGANIZATION') {
    throw new Error(`${label} must be TENANT or ORGANIZATION, got ${claimText(value) === '' ? '(empty)' : claimText(value)}.`)
  }
  return normalized
}

/**
 * Build one deterministic public application access token.
 *
 * Tenant-level: `organization_id = 0`, `login_scope = TENANT`,
 * `ownership_scope = TENANT`. Organization-level: the installation's non-zero
 * organization id, `login_scope = ORGANIZATION`, `ownership_scope =
 * ORGANIZATION` (`APP_ACCESS_TOKEN_SPEC.md` §3.2, §3.2.1).
 * @param options - identity, profile, runtime target, and optional rotation instants.
 * @returns the JWT compact serialization.
 */
export function buildPublicApplicationAccessToken(options: AccessTokenBuildOptions): string {
  const appId = requireText(options.identity.appId, 'appId')
  const tenantId = requireDecimalId(options.identity.tenantId, 'tenantId')
  const declaredOrganizationId = typeof options.identity.organizationId === 'string'
    ? options.identity.organizationId.trim()
    : ''
  const level: AccessTokenLevel = options.level
    ?? (declaredOrganizationId !== '' && declaredOrganizationId !== '0' ? 'organization' : 'tenant')
  // An explicit level decides, and it must not silently discard a declared
  // organization: the canonical generator refuses the same contradiction
  // (`ownership_scope=TENANT` with a non-zero organization), so the browser
  // builder fails closed instead of coercing the binding away.
  if (options.level === 'tenant' && declaredOrganizationId !== '' && declaredOrganizationId !== '0') {
    throw new Error(
      `level=tenant contradicts organizationId=${declaredOrganizationId}; `
      + 'an organization binding requires level=organization.',
    )
  }
  const organizationId = level === 'organization'
    ? requireDecimalId(declaredOrganizationId, 'organizationId')
    : '0'
  if (!(RUNTIME_TARGETS as readonly string[]).includes(options.runtimeTarget)) {
    throw new Error(
      `runtimeTarget=${options.runtimeTarget} is not a canonical runtime target; expected one of `
      + `${RUNTIME_TARGETS.join(', ')}.`,
    )
  }
  const environment = options.profile.environment
  if (!(CLIENT_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new Error(`environment=${environment} is not a lifecycle environment.`)
  }
  const deploymentProfile = options.profile.deploymentProfile
  if (!(CLIENT_DEPLOYMENT_PROFILES as readonly string[]).includes(deploymentProfile)) {
    throw new Error(`deploymentProfile=${deploymentProfile} is not a deployment profile.`)
  }
  const permissionScope = (options.permissionScope ?? options.identity.permissionScope ?? ['iam:self'])
    .map(entry => requireText(entry, 'permissionScope entry'))
  const uniquePermissionScope = [...new Set(permissionScope.length > 0 ? permissionScope : ['iam:self'])]
  const issuedAt = options.issuedAt === undefined ? PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT : Math.trunc(options.issuedAt)
  const expiresAt = options.expiresAt === undefined
    ? PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY
    : Math.trunc(options.expiresAt)
  if (!isApplicationAccessTokenExpiryPermanent(expiresAt) && expiresAt <= issuedAt) {
    throw new Error(
      `expiresAt=${expiresAt} must be after the token's issuedAt=${issuedAt}, or `
      + `${PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY} for a permanent token.`,
    )
  }
  const ownershipScope: OwnershipScope = level === 'organization' ? 'ORGANIZATION' : 'TENANT'
  const loginScope: OwnershipScope = organizationId === '0' ? 'TENANT' : 'ORGANIZATION'
  if (loginScope !== ownershipScope) {
    throw new Error(
      `ownership_scope=${ownershipScope} contradicts organization_id=${organizationId}; `
      + 'the release scope and the organization binding must agree.',
    )
  }
  const sessionId = typeof options.sessionId === 'string' && options.sessionId.trim() !== ''
    ? options.sessionId.trim()
    : `bootstrap-public-${appId}-${deploymentProfile}.${environment}`

  const header = { alg: 'none', kid: PUBLIC_APP_ACCESS_TOKEN_KID, typ: 'JWT' }
  const payload = {
    app_id: appId,
    aud: appId,
    deployment_mode: deploymentModeOf(deploymentProfile),
    deployment_profile: deploymentProfile,
    environment,
    exp: expiresAt,
    iat: issuedAt,
    iss: PUBLIC_APP_ACCESS_TOKEN_ISSUER,
    login_scope: loginScope,
    organization_id: organizationId,
    ownership_scope: ownershipScope,
    permission_scope: uniquePermissionScope,
    runtime_target: options.runtimeTarget,
    session_id: sessionId,
    tenant_id: tenantId,
    token_class: 'application',
    token_type: 'access',
    token_version: PUBLIC_APP_ACCESS_TOKEN_VERSION,
    user_id: '0',
  }
  return `${base64urlJson(header)}.${base64urlJson(payload)}.${PUBLIC_APP_ACCESS_TOKEN_SIGNATURE}`
}

/**
 * Decode and validate the public application token shape.
 *
 * Validation mirrors the canonical generator: header identity, the literal
 * signature segment, the application token class, the `login_scope` /
 * `organization_id` agreement, and `ownership_scope` coherence.
 * @param token - candidate three-part JWT.
 * @returns the decoded header and payload.
 */
export function decodePublicApplicationAccessToken(token: string): DecodedPublicApplicationAccessToken {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('Public application access token must be a three-part JWT compact serialization.')
  }
  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string]
  let header: unknown
  let payload: unknown
  try {
    header = decodeBase64urlJson(encodedHeader)
    payload = decodeBase64urlJson(encodedPayload)
  } catch (error: unknown) {
    throw new Error(`Public application access token payload is not valid JSON: ${messageOf(error)}`)
  }
  if (typeof header !== 'object' || header === null) {
    throw new Error('Public application access token header is not a JSON object.')
  }
  const headerRecord = header as Record<string, unknown>
  if (headerRecord.alg !== 'none' || headerRecord.kid !== PUBLIC_APP_ACCESS_TOKEN_KID) {
    throw new Error(`Public application access token header must declare alg=none and kid=${PUBLIC_APP_ACCESS_TOKEN_KID}.`)
  }
  if (signature !== PUBLIC_APP_ACCESS_TOKEN_SIGNATURE) {
    throw new Error(`Public application access token signature segment must be "${PUBLIC_APP_ACCESS_TOKEN_SIGNATURE}".`)
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Public application access token payload is not a JSON object.')
  }
  const payloadRecord = payload as Record<string, unknown>
  if (payloadRecord.token_class !== 'application' || payloadRecord.token_type !== 'access') {
    throw new Error('Public application access token must declare token_class=application and token_type=access.')
  }
  // `exp` is permanent (`0`) or a concrete rotation deadline; any other shape is
  // malformed. A concrete past deadline is a gate decision, not a decode failure.
  if (
    payloadRecord.exp !== undefined
    && (typeof payloadRecord.exp !== 'number' || !Number.isInteger(payloadRecord.exp) || payloadRecord.exp < 0)
  ) {
    throw new Error(
      'Public application access token exp claim must be a non-negative integer; '
      + `got ${claimText(payloadRecord.exp)}. Use exp=0 for a permanent token.`,
    )
  }
  const organizationId = claimText(payloadRecord.organization_id)
  const expectedLoginScope = organizationId === '0' ? 'TENANT' : 'ORGANIZATION'
  if (payloadRecord.login_scope !== expectedLoginScope) {
    throw new Error(
      `Public application access token login_scope=${claimText(payloadRecord.login_scope)} is inconsistent `
      + `with organization_id=${organizationId}; expected ${expectedLoginScope}.`,
    )
  }
  const declaredOwnershipScope = typeof payloadRecord.ownership_scope === 'string'
    ? payloadRecord.ownership_scope.trim()
    : ''
  const ownershipScope = declaredOwnershipScope === ''
    ? expectedLoginScope
    : normalizeOwnershipScope(declaredOwnershipScope, 'ownership_scope')
  if (ownershipScope === 'ORGANIZATION' && organizationId === '0') {
    throw new Error(
      'Public application access token ownership_scope=ORGANIZATION requires a non-zero organization_id.',
    )
  }
  if (ownershipScope !== 'ORGANIZATION' && organizationId !== '0') {
    throw new Error(
      `Public application access token ownership_scope=${ownershipScope} requires organization_id=0; `
      + `got ${organizationId}.`,
    )
  }
  return {
    header: headerRecord as DecodedPublicApplicationAccessToken['header'],
    payload: payloadRecord,
  }
}

/**
 * One-line human summary of a token's isolation claims (the dialog preview).
 * @param token - a generated or committed token.
 * @returns the claims the initializer shows before writing.
 */
export function summarizePublicApplicationAccessToken(token: string): {
  appId: string
  tenantId: string
  organizationId: string
  loginScope: string
  ownershipScope: string
  environment: string
  deploymentProfile: string
  runtimeTarget: string
  permissionScope: string[]
} {
  const { payload } = decodePublicApplicationAccessToken(token)
  const list = Array.isArray(payload.permission_scope)
    ? payload.permission_scope.map(entry => claimText(entry))
    : []
  return {
    appId: claimText(payload.app_id),
    tenantId: claimText(payload.tenant_id),
    organizationId: claimText(payload.organization_id),
    loginScope: claimText(payload.login_scope),
    ownershipScope: claimText(payload.ownership_scope),
    environment: claimText(payload.environment),
    deploymentProfile: claimText(payload.deployment_profile),
    runtimeTarget: claimText(payload.runtime_target),
    permissionScope: list,
  }
}
