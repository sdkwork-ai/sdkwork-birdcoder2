/**
 * SDKWork bootstrap env glue for the harness app bins: resolve the deployment
 * profile the launch environment declares, apply the source/dev vs packaged
 * gateway (`pnpm dsh web` / `pnpm desktop:dev` → `api-dev.birdcoder.com`,
 * packaged/npx/container → `api.birdcoder.com`), and ensure a bootstrap
 * access token in the gitignored profile overlay, reusing
 * `@sdkwork/iam-credential-entry` for token generation and env-file parsing.
 * Token generation follows sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1:
 * development may generate a disposable local JWT, test only with an explicit
 * allowance, and staging/production fail closed to a private secret source.
 * The module never copies JWT creation, manifest identity lookup, env merge,
 * bootstrap env-file parsing, or inline serialization — those stay in the
 * canonical SDKWork package.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'

/**
 * The canonical lifecycle environments a deployment profile may name.
 * Mirrors sdkwork-specs `ENVIRONMENT_SPEC.md` section 5.1.
 */
export type SdkworkLifecycleEnvironment = 'development' | 'test' | 'staging' | 'production'

/** One deployment profile resolved from the launch environment. */
export interface SdkworkBootstrapProfile {
  /** Canonical lifecycle environment (aliases `dev`/`prod` normalized). */
  environment: SdkworkLifecycleEnvironment
  /** Deployment profile, `standalone` or `cloud`. */
  deploymentProfile: 'standalone' | 'cloud'
  /** Exact two-segment profile id, e.g. `standalone.test`. */
  profileId: string
}

/** Options for {@link ensureSdkworkBootstrapToken}. */
export interface EnsureSdkworkBootstrapTokenOptions {
  /** Repository root whose `sdkwork.app.config.json` and overlays resolve against; defaults to `process.cwd()`. */
  cwd?: string
  /** The launch environment (already layered with `.env` values); defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>
  /** Allow generating a disposable local JWT for the test tier (section 6.1). */
  allowTestTokenGeneration?: boolean
  /**
   * When no local fixture or registration output exists, attempt IAM
   * application bootstrap (register → provision → enable → access credential)
   * using bootstrap auth credentials from the environment or
   * `~/.sdkwork/iam-bootstrap/` (legacy fallback: `~/.sdkwork/users/`).
   */
  tryApplicationBootstrap?: boolean
  /** Sink for one-line diagnostics; defaults to stderr. */
  warn?: (line: string) => void
}

/** The observed outcome of one {@link ensureSdkworkBootstrapToken} run. */
export type EnsureSdkworkBootstrapTokenResult =
  | { status: 'unconfigured' }
  | { status: 'configured' }
  | { status: 'registered'; token: string }
  | { status: 'generated'; path: string; token: string }
  | { status: 'unavailable'; reason: string }

/**
 * Copy a generated or registered bootstrap token into the launch environment
 * before {@link createLaunchEnvironmentSnapshot} / `loadLayeredEnv`, so the
 * ui-sdkwork-env host projection can resolve `SDKWORK_ACCESS_TOKEN` synchronously.
 * @param result - the outcome of {@link ensureSdkworkBootstrapToken}.
 * @param env - the mutable launch environment; defaults to `process.env`.
 */
export function materializeEnsuredBootstrapAccessToken(
  result: EnsureSdkworkBootstrapTokenResult,
  env: Record<string, string | undefined> = process.env,
): void {
  if (result.status === 'generated' || result.status === 'registered') {
    env.SDKWORK_ACCESS_TOKEN = result.token
  }
}

/** File name (repo root) of the IAM application-bootstrap registration output. */
export const REGISTERED_ENV_FILE = '.sdkwork.local.env'

/** Tracked development env materialization at the repository root. */
export const SDKWORK_DEVELOPMENT_ENV_FILE = '.env.standalone.development'

/** Development platform API gateway origin (`api-<tier>.birdcoder.com` off production). */
export const SDKWORK_DEVELOPMENT_GATEWAY_URL = 'http://api-dev.birdcoder.com'

/** Test platform API gateway origin (`api-<tier>.birdcoder.com` off production). */
export const SDKWORK_TEST_GATEWAY_URL = 'https://api-test.birdcoder.com'

/** Staging platform API gateway origin (`api-<tier>.birdcoder.com` off production). */
export const SDKWORK_STAGING_GATEWAY_URL = 'https://api-staging.birdcoder.com'

/** Production platform API gateway origin (bare `api.birdcoder.com`). */
export const SDKWORK_PRODUCTION_GATEWAY_URL = 'https://api.birdcoder.com'

/** SDKWork surface URL keys whose first non-empty value defines the target SDK origin. */
const SDKWORK_BASE_URL_KEYS = [
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL',
] as const

/** Launch profile selecting the SDKWork gateway origin. */
export type SdkworkLaunchProfile = SdkworkLifecycleEnvironment

/** Options for {@link applySdkworkLaunchEnv}. */
export interface ApplySdkworkLaunchEnvOptions {
  /** Invoking directory (`apps/desktop` or a nested cwd in source `dsh web`; the user home when packaged). */
  cwd: string
  /** Source/dev launches are `development`; packaged/npx/container launches are `production`. */
  profile: SdkworkLaunchProfile
  /** Mutable launch environment; defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Sink for one-line diagnostics; defaults to stderr. */
  warn?: (line: string) => void
}

/** Result of {@link applySdkworkLaunchEnv}. */
export interface AppliedSdkworkLaunchEnv {
  /**
   * Directory whose `.env` is the project layer: the repository root for
   * development (walked up from a nested cwd), the invoking directory for production.
   */
  cwd: string
}

/**
 * The gitignored overlay that receives a generated bootstrap token for one
 * profile (`ENVIRONMENT_SPEC.md` section 5.1.7).
 * @param cwd - the repository root.
 * @param environment - the canonical lifecycle environment.
 * @returns the absolute overlay path.
 */
export function bootstrapLocalEnvPath(cwd: string, environment: string): string {
  return resolve(cwd, `.env.standalone.${environment}.bootstrap.local`)
}

/**
 * The tracked materialized env file for one lifecycle environment.
 * @param cwd - the repository root.
 * @param environment - the canonical lifecycle environment.
 * @returns the absolute materialized env path.
 */
export function trackedSdkworkEnvPath(cwd: string, environment: SdkworkLifecycleEnvironment): string {
  return resolve(cwd, `.env.standalone.${environment}`)
}

/**
 * Resolve the deployment profile the launch environment declares, preferring
 * the exact profile id and falling back to the deployment/environment pair.
 * @param env - the launch environment.
 * @returns the resolved profile, or `undefined` when no SDKWork identity key is set.
 */
export function resolveSdkworkBootstrapProfile(
  env: Readonly<Record<string, string | undefined>>,
): SdkworkBootstrapProfile | undefined {
  const profileId = firstDefined(env, ['SDKWORK_PROFILE_ID', 'SDKWORK_BIRDCODER_PROFILE_ID'])
  if (profileId !== undefined) {
    const parsed = parseProfileId(profileId)
    if (parsed !== undefined) return parsed
  }
  const deploymentProfile = firstDefined(env, ['SDKWORK_DEPLOYMENT_PROFILE', 'SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE'])
  const environment = firstDefined(env, ['SDKWORK_BIRDCODER_ENVIRONMENT', 'SDKWORK_ENVIRONMENT'])
  if (deploymentProfile === undefined && environment === undefined) return undefined
  const deployment = normalizeDeploymentProfile(deploymentProfile) ?? 'standalone'
  const lifecycle = normalizeLifecycle(environment)
  if (lifecycle === undefined) return undefined
  return {
    environment: lifecycle,
    deploymentProfile: deployment,
    profileId: `${deployment}.${lifecycle}`,
  }
}

/**
 * Walk upward from the invoking directory to the repository root that owns the
 * SDKWork manifest, so launchers invoked from a subdirectory (`apps/cli`,
 * `apps/desktop`) resolve the same overlays. Directory discovery only — manifest
 * content stays with `@sdkwork/iam-credential-entry`.
 * @param start - the invoking directory.
 * @returns the nearest ancestor containing `sdkwork.app.config.json`, or `start` when none exists.
 */
export function resolveSdkworkRepoRoot(start: string): string {
  let current = resolve(start)
  for (;;) {
    if (existsSync(resolve(current, 'sdkwork.app.config.json'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

/**
 * Choose the SDKWork gateway profile for a source-aware launcher.
 * A directory tree that contains `sdkwork.app.config.json` is a source
 * checkout (`pnpm dsh web`, `pnpm desktop:dev`) and uses development.
 * Packaged installs, npx, and the container runtime have no such file and
 * use production. The desktop shell still passes an explicit profile because
 * a packaged app may chdir to a homedir that happens to contain a checkout.
 * @param cwd - the invoking directory.
 * @returns `development` inside a source checkout, otherwise `production`.
 */
export function resolveSdkworkLaunchProfile(cwd: string): SdkworkLaunchProfile {
  return existsSync(resolve(resolveSdkworkRepoRoot(cwd), 'sdkwork.app.config.json'))
    ? 'development'
    : 'production'
}

/**
 * Fill unset SDKWork identity, gateway URL, and bootstrap-token keys for a
 * launcher. Source launches walk to the repository root, apply the project
 * `.env` when present, then fill remaining SDKWork keys from the tracked
 * materialization for the selected lifecycle environment (falling back to
 * built-in defaults for the same environment). This lets `pnpm dsh web` and
 * `pnpm desktop:dev` honor a repo-root `.env` copied from
 * `.env.standalone.test` or `.env.standalone.production` before the frozen
 * launch snapshot is created. Packaged/npx/container launches still fall back
 * to production defaults when no repository manifest is present. Finally the
 * gitignored overlay for the active lifecycle environment fills a blank
 * `SDKWORK_ACCESS_TOKEN`, so an already-generated JWT reaches the launch
 * snapshot without waiting on `@sdkwork/iam-credential-entry`.
 * Empty placeholder values in tracked files are skipped so a later project
 * `.env` can still supply secrets. Inherited process env values are never
 * replaced except a blank `SDKWORK_ACCESS_TOKEN`, which the overlay may fill.
 * @param options - invoking directory, launch profile, and mutable environment.
 * @returns the directory `loadLayeredEnv` should use as the project layer.
 */
export function applySdkworkLaunchEnv(
  options: ApplySdkworkLaunchEnvOptions,
): AppliedSdkworkLaunchEnv {
  const env = options.env ?? process.env
  const warn = options.warn ?? (line => void process.stderr.write(line))
  const invoking = resolve(options.cwd)
  const cwd = resolveSdkworkRepoRoot(options.cwd)
  const repoManifest = resolve(cwd, 'sdkwork.app.config.json')
  const sourceCheckout = existsSync(repoManifest)
  if (options.profile === 'production' && invoking !== cwd) {
    applyUnset(env, launchDefaultsForEnvironment('production'))
    return { cwd: invoking }
  }
  if (sourceCheckout) {
    const projectEnv = readNonEmptyEnvFile(resolve(cwd, '.env'), warn)
    if (projectEnv !== undefined) applyUnset(env, projectEnv)
  }
  const selectedEnvironment = resolveSdkworkBootstrapProfile(env)?.environment ?? options.profile
  const fromFile = readNonEmptyEnvFile(trackedSdkworkEnvPath(cwd, selectedEnvironment), warn)
  if (fromFile !== undefined) applyUnset(env, fromFile)
  applyUnset(env, launchDefaultsForEnvironment(selectedEnvironment))
  const overlay = readNonEmptyEnvFile(bootstrapLocalEnvPath(cwd, selectedEnvironment), warn)
  if (overlay !== undefined) applyBlank(env, filterBootstrapOverlayForGateway(env, overlay, warn))
  const registered = readNonEmptyEnvFile(resolve(cwd, REGISTERED_ENV_FILE), warn)
  if (registered !== undefined) {
    const filtered = filterBootstrapOverlayForGateway(env, registered, warn)
    applyBlank(env, filtered)
    const registeredToken = filtered.SDKWORK_ACCESS_TOKEN?.trim()
    if (registeredToken) env.SDKWORK_ACCESS_TOKEN = registeredToken
  }
  return { cwd }
}

/**
 * Ensure a bootstrap access token exists for the declared profile. An
 * explicitly configured `SDKWORK_ACCESS_TOKEN`, the registration output
 * (`.sdkwork.local.env`), and an existing overlay token win without loading
 * `@sdkwork/iam-credential-entry`; otherwise development generates a
 * disposable local JWT into the gitignored overlay, test requires
 * `allowTestTokenGeneration`, and staging/production fail closed. Failures
 * never throw — the caller continues with interactive IAM login as the
 * credential fallback.
 * @param options - root, environment, and diagnostic inputs.
 * @returns the observed outcome.
 */
export async function ensureSdkworkBootstrapToken(
  options: EnsureSdkworkBootstrapTokenOptions = {},
): Promise<EnsureSdkworkBootstrapTokenResult> {
  const cwd = resolveSdkworkRepoRoot(options.cwd ?? process.cwd())
  const env = options.env ?? process.env
  const warn = options.warn ?? (line => void process.stderr.write(line))
  const profile = resolveSdkworkBootstrapProfile(env)
  if (profile === undefined) return { status: 'unconfigured' }

  // Re-sync tenant application registration before reusing cached credentials.
  // applySdkworkLaunchEnv may already have copied a stale SDKWORK_ACCESS_TOKEN
  // from .sdkwork.local.env or a bootstrap overlay into process.env; without
  // this step ensure would treat it as configured and skip IAM bootstrap.
  if (
    options.tryApplicationBootstrap !== false
    && (profile.environment === 'development' || profile.environment === 'test')
  ) {
    const provisioned = await tryProvisionRegisteredBootstrapToken({
      cwd,
      env,
      profile,
      warn,
      allowAttempt: true,
    })
    if (provisioned !== undefined) return provisioned
  }

  const configured = env.SDKWORK_ACCESS_TOKEN?.trim()
  if (configured !== undefined && configured !== '') {
    if (!isUnusableBootstrapAccessToken(env, configured)) {
      return { status: 'configured' }
    }
    warn(
      `${PRODUCT_TAG}: ignoring local IAM or fixture bootstrap access token in the launch environment because the active SDKWork gateway is not loopback; provision a real token or run app bootstrap\n`,
    )
    delete (env as Record<string, string | undefined>).SDKWORK_ACCESS_TOKEN
  }

  const registered = readAccessTokenEnvFile(resolve(cwd, REGISTERED_ENV_FILE), warn)
  if (registered !== undefined) {
    if (!isUnusableBootstrapAccessToken(env, registered)) {
      return { status: 'registered', token: registered }
    }
    warn(
      `${PRODUCT_TAG}: ignoring local IAM or fixture bootstrap token in ${REGISTERED_ENV_FILE} because the active SDKWork gateway is not loopback; provision a real token or run app bootstrap\n`,
    )
  }
  const overlayPath = bootstrapLocalEnvPath(cwd, profile.environment)
  const existing = readAccessTokenEnvFile(overlayPath, warn)
  if (existing !== undefined) {
    if (fixtureBootstrapTokenAllowed(env)) {
      return { status: 'generated', path: overlayPath, token: existing }
    }
    if (looksLikeLocalFixtureJwt(existing)) {
      warn(`${PRODUCT_TAG}: ignoring local fixture bootstrap token at ${overlayPath} because the active SDKWork gateway is not loopback; provision a real token or run app bootstrap\n`)
    } else {
      return { status: 'generated', path: overlayPath, token: existing }
    }
  }
  if (profile.environment === 'staging' || profile.environment === 'production') {
    warn(`${PRODUCT_TAG}: ${profile.environment} bootstrap access tokens must be provisioned by a private secret source; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'production/staging tokens must come from a private secret source' }
  }
  if (profile.environment === 'test' && options.allowTestTokenGeneration !== true) {
    const provisioned = await tryProvisionRegisteredBootstrapToken({
      cwd,
      env,
      profile,
      warn,
      allowAttempt: options.tryApplicationBootstrap !== false,
    })
    if (provisioned !== undefined) return provisioned
    warn(`${PRODUCT_TAG}: test bootstrap token generation requires --allow-test-token-generation; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'test token generation requires allowTestTokenGeneration' }
  }
  if (!fixtureBootstrapTokenAllowed(env)) {
    const provisioned = await tryProvisionRegisteredBootstrapToken({
      cwd,
      env,
      profile,
      warn,
      allowAttempt: options.tryApplicationBootstrap !== false,
    })
    if (provisioned !== undefined) return provisioned
    warn(`${PRODUCT_TAG}: refusing to generate a local fixture bootstrap token for a non-loopback SDKWork gateway; provision a real token or run app bootstrap\n`)
    return { status: 'unavailable', reason: 'development/test fixture tokens require a loopback SDKWork gateway' }
  }

  const credentialEntry = await importCredentialEntry(warn)
  if (credentialEntry === undefined) {
    return { status: 'unavailable', reason: 'the @sdkwork/iam-credential-entry package is not installed' }
  }
  let manifestPath: string
  try {
    manifestPath = credentialEntry.resolveRepoApplicationManifestPath(cwd)
  } catch (error) {
    warn(`${PRODUCT_TAG}: ${String(error)}\n`)
    return { status: 'unavailable', reason: `no sdkwork.app.config.json: ${String(error)}` }
  }
  let manifest: unknown
  try {
    manifest = credentialEntry.readApplicationManifest(manifestPath)
  } catch (error) {
    warn(`${PRODUCT_TAG}: failed to read ${manifestPath}: ${String(error)}\n`)
    return { status: 'unavailable', reason: `unreadable manifest: ${String(error)}` }
  }

  let token: string
  try {
    token = credentialEntry.buildBootstrapAccessTokenEnvRecord('', {
      environment: profile.environment,
      manifest,
      ...profile.environment === 'test' ? { allowTestTokenGeneration: true } : {},
    })[credentialEntry.SDKWORK_ACCESS_TOKEN_ENV_KEY] as string
  } catch (error) {
    warn(`${PRODUCT_TAG}: failed to generate a bootstrap access token: ${String(error)}\n`)
    return { status: 'unavailable', reason: `token generation failed: ${String(error)}` }
  }
  try {
    writeFileSync(overlayPath, `# SDKWork private bootstrap credentials (gitignored).\n${credentialEntry.SDKWORK_ACCESS_TOKEN_ENV_KEY}=${token}\n`)
  } catch (error) {
    warn(`${PRODUCT_TAG}: failed to write ${overlayPath}: ${String(error)}\n`)
    return { status: 'unavailable', reason: `overlay write failed: ${String(error)}` }
  }
  return { status: 'generated', path: overlayPath, token }
}

/** Diagnostic prefix on warn lines. */
const PRODUCT_TAG = 'sdkwork-env'

function launchDefaultsForEnvironment(
  environment: SdkworkLifecycleEnvironment,
): Readonly<Record<string, string>> {
  return {
    SDKWORK_ENVIRONMENT: environment,
    SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
    SDKWORK_PROFILE_ID: `standalone.${environment}`,
    SDKWORK_BIRDCODER_ENVIRONMENT: environment,
    SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
    SDKWORK_BIRDCODER_PROFILE_ID: `standalone.${environment}`,
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: gatewayUrlForEnvironment(environment),
  }
}

function gatewayUrlForEnvironment(environment: SdkworkLifecycleEnvironment): string {
  switch (environment) {
    case 'development':
      return SDKWORK_DEVELOPMENT_GATEWAY_URL
    case 'test':
      return SDKWORK_TEST_GATEWAY_URL
    case 'staging':
      return SDKWORK_STAGING_GATEWAY_URL
    case 'production':
      return SDKWORK_PRODUCTION_GATEWAY_URL
    default:
      environment satisfies never
      return SDKWORK_PRODUCTION_GATEWAY_URL
  }
}

/**
 * Assign names that are unset and non-empty. Empty placeholders in tracked env
 * files must not block a later project `.env` from supplying secrets.
 * @param env - the mutable launch environment.
 * @param values - candidate assignments.
 */
function applyUnset(env: Record<string, string | undefined>, values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value.trim() === '') continue
    if (env[name] === undefined) env[name] = value
  }
}

/**
 * Assign names that are blank (unset or whitespace-only) and non-empty.
 * Used for the gitignored overlay so a tracked `SDKWORK_ACCESS_TOKEN=`
 * placeholder cannot block an already-generated JWT.
 * @param env - the mutable launch environment.
 * @param values - candidate assignments.
 */
function applyBlank(env: Record<string, string | undefined>, values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value.trim() === '') continue
    if (!env[name]?.trim()) env[name] = value
  }
}

/**
 * Parse one env file, dropping empty values. Missing files return `undefined`.
 * @param path - absolute env file path.
 * @param warn - sink for unreadable-file diagnostics.
 * @returns non-empty assignments, or `undefined` when the file is absent.
 */
function readNonEmptyEnvFile(
  path: string,
  warn: (line: string) => void,
): Record<string, string> | undefined {
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') {
      warn(`${PRODUCT_TAG}: failed to load ${path}: ${String(error)}\n`)
    }
    return undefined
  }
  const parsed = parseEnv(content) as Record<string, string>
  const values: Record<string, string> = {}
  for (const [name, value] of Object.entries(parsed)) {
    if (value.trim() === '') continue
    values[name] = value
  }
  return values
}

/**
 * Read `SDKWORK_ACCESS_TOKEN` from one env file without loading
 * `@sdkwork/iam-credential-entry`, so an existing overlay or registration
 * output still reaches the launch snapshot when that package cannot import.
 * @param path - absolute env file path.
 * @param warn - sink for unreadable-file diagnostics.
 * @returns the non-empty token, or `undefined` when absent.
 */
function readAccessTokenEnvFile(path: string, warn: (line: string) => void): string | undefined {
  return readNonEmptyEnvFile(path, warn)?.SDKWORK_ACCESS_TOKEN?.trim()
}

function firstDefined(
  env: Readonly<Record<string, string | undefined>>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function parseProfileId(value: string): SdkworkBootstrapProfile | undefined {
  const [deploymentProfile, environment, ...rest] = value.split('.')
  if (environment === undefined) {
    const lifecycle = normalizeLifecycle(deploymentProfile)
    if (lifecycle === undefined) return undefined
    return { environment: lifecycle, deploymentProfile: 'standalone', profileId: `standalone.${lifecycle}` }
  }
  if (deploymentProfile === undefined || rest.length > 0) return undefined
  const deployment = normalizeDeploymentProfile(deploymentProfile)
  const lifecycle = normalizeLifecycle(environment)
  if (deployment === undefined || lifecycle === undefined) return undefined
  return { environment: lifecycle, deploymentProfile: deployment, profileId: `${deployment}.${lifecycle}` }
}

function normalizeDeploymentProfile(value: string | undefined): 'standalone' | 'cloud' | undefined {
  if (value === 'standalone' || value === 'cloud') return value
  return undefined
}

function normalizeLifecycle(value: string | undefined): SdkworkLifecycleEnvironment | undefined {
  if (value === undefined) return undefined
  const normalized = value.toLowerCase()
  if (normalized === 'dev') return 'development'
  if (normalized === 'prod') return 'production'
  if (normalized === 'development' || normalized === 'test' || normalized === 'staging' || normalized === 'production') {
    return normalized
  }
  return undefined
}

/**
 * Strip a gitignored overlay bootstrap token when it is a local fixture JWT and
 * the active gateway is not loopback.
 * @param env - the launch environment after gateway defaults are applied.
 * @param overlay - overlay assignments read from disk.
 * @param warn - sink for one-line diagnostics.
 * @returns overlay values safe to apply to the launch environment.
 */
function filterBootstrapOverlayForGateway(
  env: Readonly<Record<string, string | undefined>>,
  overlay: Readonly<Record<string, string>>,
  warn: (line: string) => void,
): Record<string, string> {
  const token = overlay.SDKWORK_ACCESS_TOKEN?.trim()
  if (token === undefined || token === '' || !isUnusableBootstrapAccessToken(env, token)) {
    return { ...overlay }
  }
  warn(
    `${PRODUCT_TAG}: ignoring local IAM or fixture bootstrap token in the profile overlay because the active SDKWork gateway is not loopback; provision a real token or run app bootstrap\n`,
  )
  const filtered = { ...overlay }
  delete filtered.SDKWORK_ACCESS_TOKEN
  return filtered
}

function isUnusableBootstrapAccessToken(
  env: Readonly<Record<string, string | undefined>>,
  token: string,
): boolean {
  if (fixtureBootstrapTokenAllowed(env)) return false
  return looksLikeLocalFixtureJwt(token) || looksLikeLocalIamIssuedToken(token)
}

/**
 * Detect JWTs issued by a local/private IAM gateway (`sdkwork-iam-local`).
 * They are valid only against that gateway, not `api-dev.*` SaaS origins.
 * @param token - raw JWT string.
 * @returns whether the payload issuer is the local IAM issuer.
 */
function looksLikeLocalIamIssuedToken(token: string): boolean {
  const [, payloadPart, , ...rest] = token.split('.')
  if (payloadPart === undefined || rest.length > 0) return false
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { iss?: unknown }
    return payload.iss === 'sdkwork-iam-local'
  } catch {
    return false
  }
}

function fixtureBootstrapTokenAllowed(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const baseUrl = firstDefined(env, SDKWORK_BASE_URL_KEYS)
  if (baseUrl === undefined) return false
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function looksLikeLocalFixtureJwt(token: string): boolean {
  const [headerPart, , signaturePart, ...rest] = token.split('.')
  if (headerPart === undefined || signaturePart === undefined || rest.length > 0) return false
  if (signaturePart !== 'signature') return false
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: unknown }
    return header.alg === 'none'
  } catch {
    return false
  }
}

function mapLifecycleToBootstrapEnvironment(environment: SdkworkLifecycleEnvironment): string {
  switch (environment) {
    case 'development':
      return 'dev'
    case 'production':
      return 'prod'
    case 'test':
    case 'staging':
      return environment
    default:
      environment satisfies never
      return 'dev'
  }
}

function resolveBackendApiBaseUrlFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const configured = env.SDKWORK_BACKEND_BASE_URL?.trim()
  if (configured) return configured
  const gateway = firstDefined(env, SDKWORK_BASE_URL_KEYS)
  if (gateway === undefined) return undefined
  try {
    return new URL(gateway).origin
  } catch {
    return undefined
  }
}

function resolveBootstrapPrimaryDomain(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const configured = firstDefined(env, ['SDKWORK_APP_DOMAIN'])
  if (configured !== undefined) return configured
  const publicUrl = env.SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL?.trim()
  if (publicUrl) {
    try {
      return new URL(publicUrl).hostname
    } catch {
      /* fall through */
    }
  }
  const gateway = firstDefined(env, SDKWORK_BASE_URL_KEYS)
  if (gateway === undefined) return undefined
  try {
    return new URL(gateway).hostname
  } catch {
    return undefined
  }
}

interface IamApplicationBootstrapModule {
  bootstrapApplicationFromManifest: (input: Record<string, unknown>) => Promise<{
    env: Record<string, string | undefined>
  }>
  createFetchIamApplicationBootstrapClient: (config: { baseUrl: string; fetch?: typeof fetch }) => unknown
  createIamApplicationBootstrapClientFromAppbaseBackendSdk: (config: { baseUrl: string }) => unknown
  formatBootstrapEnvFile: (input: Record<string, unknown>) => string
  hashManifestContent: (raw: string) => string
  writeRegisteredBootstrapEnvFiles?: (
    repoRoot: string,
    contents: string,
    environment?: string,
  ) => Promise<string[]>
  loadBootstrapAuthProfileFromHome: (options: Record<string, unknown>) => Promise<{
    profile: Record<string, unknown>
  } | null>
  resolveBootstrapAuth: (options: {
    env?: Record<string, string | undefined>
    profile?: Record<string, unknown> | null
  }) => { authToken?: string; username?: string; password?: string; email?: string }
  resolveBootstrapEnvironmentFromEnv: (
    env: Record<string, string | undefined>,
    overrides: Record<string, unknown>,
  ) => { primaryDomain?: string }
}

function hasBootstrapAuthCredentials(auth: {
  authToken?: string
  username?: string
  password?: string
  email?: string
}): boolean {
  if (auth.authToken?.trim()) return true
  const username = auth.username ?? auth.email
  return Boolean(username?.trim() && auth.password?.trim())
}

async function importIamApplicationBootstrap(
  warn: (line: string) => void,
): Promise<IamApplicationBootstrapModule | undefined> {
  try {
    return await import('@sdkwork/iam-application-bootstrap' as string) as unknown as IamApplicationBootstrapModule
  } catch (error) {
    warn(`${PRODUCT_TAG}: @sdkwork/iam-application-bootstrap is unavailable (${String(error)}); remote bootstrap provisioning is skipped\n`)
    return undefined
  }
}

interface TryProvisionRegisteredBootstrapTokenOptions {
  cwd: string
  env: Readonly<Record<string, string | undefined>>
  profile: SdkworkBootstrapProfile
  warn: (line: string) => void
  allowAttempt: boolean
}

async function tryProvisionRegisteredBootstrapToken(
  options: TryProvisionRegisteredBootstrapTokenOptions,
): Promise<EnsureSdkworkBootstrapTokenResult | undefined> {
  if (!options.allowAttempt) return undefined
  if (options.profile.environment === 'staging' || options.profile.environment === 'production') {
    return undefined
  }

  const bootstrapModule = await importIamApplicationBootstrap(options.warn)
  if (bootstrapModule === undefined) return undefined

  const backendApiBaseUrl = resolveBackendApiBaseUrlFromEnv(options.env)
  const primaryDomain = resolveBootstrapPrimaryDomain(options.env)
  if (backendApiBaseUrl === undefined || primaryDomain === undefined) return undefined

  const envRecord = options.env as Record<string, string | undefined>
  const bootstrapAuthProfile = await bootstrapModule.loadBootstrapAuthProfileFromHome({
    env: envRecord,
    lifecycleEnvironment: options.profile.environment,
    deploymentProfile: options.profile.deploymentProfile,
    profileId: options.profile.profileId,
  })
  const auth = bootstrapModule.resolveBootstrapAuth({
    env: envRecord,
    profile: bootstrapAuthProfile?.profile ?? null,
  })
  if (!hasBootstrapAuthCredentials(auth)) {
    return undefined
  }

  const manifestPath = resolve(options.cwd, 'sdkwork.app.config.json')
  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch {
    return undefined
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    options.warn(`${PRODUCT_TAG}: ${manifestPath} is not valid JSON: ${String(error)}\n`)
    return undefined
  }

  const manifestRecord = manifest as { backend?: { tenantId?: string; organizationId?: string } }
  const environment = bootstrapModule.resolveBootstrapEnvironmentFromEnv(envRecord, {
    backendApiBaseUrl,
    environment: mapLifecycleToBootstrapEnvironment(options.profile.environment),
    tenantId: manifestRecord.backend?.tenantId,
    organizationId: manifestRecord.backend?.organizationId,
    primaryDomain,
  })

  try {
    const createClient = bootstrapModule.createFetchIamApplicationBootstrapClient
      ?? bootstrapModule.createIamApplicationBootstrapClientFromAppbaseBackendSdk
    const client = createClient({
      baseUrl: backendApiBaseUrl,
    })
    const result = await bootstrapModule.bootstrapApplicationFromManifest({
      manifest,
      manifestHash: bootstrapModule.hashManifestContent(raw),
      environment,
      auth,
      client,
      profile: bootstrapAuthProfile?.profile ?? null,
    })
    const contents = `# SDKWork IAM application-bootstrap registration output (gitignored).\n${bootstrapModule.formatBootstrapEnvFile({
      result,
      primaryDomain: environment.primaryDomain,
    })}`
    const overlayPaths = bootstrapModule.writeRegisteredBootstrapEnvFiles
      ? await bootstrapModule.writeRegisteredBootstrapEnvFiles(
        options.cwd,
        contents,
        options.profile.environment,
      )
      : [resolve(options.cwd, REGISTERED_ENV_FILE)]
    if (!bootstrapModule.writeRegisteredBootstrapEnvFiles) {
      writeFileSync(overlayPaths[0] ?? resolve(options.cwd, REGISTERED_ENV_FILE), contents.endsWith('\n') ? contents : `${contents}\n`)
    }
    const token = result.env.SDKWORK_ACCESS_TOKEN?.trim()
    if (token === undefined || token === '') {
      options.warn(`${PRODUCT_TAG}: IAM application bootstrap did not return SDKWORK_ACCESS_TOKEN\n`)
      return undefined
    }
    options.warn(
      `${PRODUCT_TAG}: provisioned bootstrap access token via IAM application bootstrap; wrote ${overlayPaths[0]}\n`,
    )
    return { status: 'registered', token }
  } catch (error) {
    options.warn(`${PRODUCT_TAG}: IAM application bootstrap failed: ${String(error)}\n`)
    return undefined
  }
}

interface CredentialEntryModule {
  SDKWORK_ACCESS_TOKEN_ENV_KEY: string
  readBootstrapAccessTokenEnvFile(path: string): string | undefined
  readApplicationManifest(path: string): unknown
  resolveRepoApplicationManifestPath(repoRoot: string, manifestPath?: string): string
  buildBootstrapAccessTokenEnvRecord(existing: string, options: Record<string, unknown>): Record<string, string>
}

async function importCredentialEntry(
  warn: (line: string) => void,
): Promise<CredentialEntryModule | undefined> {
  try {
    return await import('@sdkwork/iam-credential-entry/node-bootstrap' as string)
  } catch (error) {
    // Optional sibling: a harness without SDKWork checkouts still boots, and
    // an existing overlay/registration token is already applied above.
    warn(`${PRODUCT_TAG}: @sdkwork/iam-credential-entry is unavailable (${String(error)}); bootstrap token generation is skipped\n`)
    return undefined
  }
}
