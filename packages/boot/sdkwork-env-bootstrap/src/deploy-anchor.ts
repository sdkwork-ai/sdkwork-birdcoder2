/**
 * Deployment application anchor shared by the Web page build and the SDKWork
 * bootstrap commands.
 *
 * One public application access token is bound to exactly one deployment
 * application (`app_id`/`aud`). Three layers can name that installation:
 *
 * - `SDKWORK_DEPLOY_APPLICATION_ID`, exported by a build host or recorded in an
 *   env layer (the README anchor contract);
 * - the profile's `SDKWORK_APP_ID`, unless it is the committed placeholder;
 * - the token itself, when a materializer already anchored it.
 *
 * This module owns the single reading of those layers, so `apps/web`'s build and
 * `scripts/bootstrap` cannot disagree about which id a checkout belongs to.
 * @module
 */

/** Placeholder a committed profile carries until a build supplies the anchor. */
export const PENDING_DEPLOY_APPLICATION_ID = '__SDKWORK_DEPLOY_APPLICATION_ID__'

/** Environment variable naming one installation's deployment application id. */
export const DEPLOY_APPLICATION_ID_ENV = 'SDKWORK_DEPLOY_APPLICATION_ID'

/** Which layer supplied a resolved deployment identity. */
export type DeployApplicationIdentitySource = 'anchor' | 'declared' | 'token'

/** The deployment application id a build must bake, plus its provenance. */
export interface DeployApplicationIdentity {
  /** Decimal or UUID deployment application id. */
  readonly appId: string
  /** Layer that supplied {@link appId}. */
  readonly source: DeployApplicationIdentitySource
}

/** Inputs of {@link resolveDeployApplicationIdentity}. */
export interface ResolveDeployApplicationIdentityOptions {
  /** Profile `SDKWORK_APP_ID`, when the loaded profile carries one. */
  readonly declaredAppId?: string
  /** Committed or generated public access token, when one is present. */
  readonly accessToken?: string
  /** `SDKWORK_DEPLOY_APPLICATION_ID` from the build environment or env layer. */
  readonly anchor?: string
}

/**
 * Reduce a declared value to the installation id it names.
 * @param value - candidate anchor or claim, possibly empty or the placeholder.
 * @returns the id, or `''` when the value names no installation.
 */
function installationId(value: string | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed === PENDING_DEPLOY_APPLICATION_ID ? '' : trimmed
}

/**
 * Decode one base64url JWT segment as a JSON object.
 * @param segment - the segment text.
 * @returns the parsed object, or undefined when it is not a JSON object.
 */
function decodeSegment(segment: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the deployment anchor a public application token is already bound to.
 *
 * A token a materializer wrote carries the installation id in `app_id`; one that
 * still carries the placeholder (or is not a three-part token) names nothing, so
 * a build keeps requiring the explicit anchor.
 * @param token - the public application token.
 * @returns the token's `app_id`, or `''` when the token names no installation.
 */
export function deployApplicationIdFromToken(token: string): string {
  const parts = String(token ?? '').trim().split('.')
  if (parts.length !== 3) return ''
  const payload = decodeSegment(parts[1] ?? '')
  return installationId(typeof payload?.app_id === 'string' ? payload.app_id : '')
}

/**
 * Re-anchor one committed public application access token on a deploy
 * application id.
 *
 * The public token is deterministic material: `app_id`/`aud` (and the
 * `session_id` derived from them) are its only installation-scoped claims, so
 * replacing them reproduces exactly the token the SDKWork materializer writes for
 * that anchor. A token already bound to `appId` is returned unchanged, so a
 * materialized token never gains a different payload ordering from a build.
 * @param token - committed token, anchored on the placeholder or a real id.
 * @param appId - deploy application id the build injects.
 * @returns the token bound to `appId`.
 * @throws When the token is not a three-part public application token.
 */
export function withDeployApplicationId(token: string, appId: string): string {
  const trimmed = String(token ?? '').trim()
  const parts = trimmed.split('.')
  if (parts.length !== 3) {
    throw new Error(`SDKWORK_ACCESS_TOKEN must be a three-part public application token; got ${parts.length} segment(s)`)
  }
  const payload = decodeSegment(parts[1] ?? '')
  if (payload === undefined) {
    throw new Error('SDKWORK_ACCESS_TOKEN payload is not a JSON object')
  }
  const previous = String(payload.app_id ?? '')
  if (previous === appId && String(payload.aud ?? '') === appId) return trimmed
  payload.app_id = appId
  payload.aud = appId
  if (typeof payload.session_id === 'string' && previous !== '') {
    payload.session_id = payload.session_id.split(previous).join(appId)
  }
  return `${parts[0]}.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${parts[2]}`
}

/**
 * Resolve the deployment application id a build must bake.
 *
 * Precedence: the explicit anchor, then the profile's declared id, then the id
 * an already-anchored token carries. An empty or placeholder value never wins,
 * so a profile that materialized its token needs no extra export while one that
 * still carries the placeholder keeps failing closed.
 * @param options - declared id, token, and anchor of the build.
 * @returns the resolved identity, or `undefined` when no layer names one.
 */
export function resolveDeployApplicationIdentity(
  options: ResolveDeployApplicationIdentityOptions,
): DeployApplicationIdentity | undefined {
  const anchor = installationId(options.anchor)
  if (anchor !== '') return { appId: anchor, source: 'anchor' }
  const declared = installationId(options.declaredAppId)
  if (declared !== '') return { appId: declared, source: 'declared' }
  const seeded = deployApplicationIdFromToken(options.accessToken ?? '')
  return seeded === '' ? undefined : { appId: seeded, source: 'token' }
}

/**
 * Per-surface anchor variable derived from a declared anchor variable.
 *
 * `SDKWORK_DEPLOY_APPLICATION_ID` plus `sdkwork-birdcoder2-web-app` yields
 * `SDKWORK_DEPLOY_APPLICATION_ID_SDKWORK_BIRDCODER2_WEB_APP`, the surface-scoped
 * name the SDKWork materializer reads before falling back to the repository-level
 * variable.
 * @param baseEnvName - declared anchor variable.
 * @param surfaceId - declared client surface id.
 * @returns the surface-scoped variable name, or `''` when it cannot be derived.
 */
export function surfaceDeployApplicationIdEnvName(baseEnvName: string, surfaceId: string): string {
  const base = String(baseEnvName ?? '').trim()
  const suffix = String(surfaceId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+/u, '')
    .replace(/_+$/u, '')
  return base === '' || suffix === '' ? '' : `${base}_${suffix}`
}
