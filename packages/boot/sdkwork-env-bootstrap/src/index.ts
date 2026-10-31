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
import type { CredentialEntryModule, IamApplicationBootstrapModule } from './sdkwork-module-types.ts'

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
  /** Repository root whose `agent.app.config.json` and overlays resolve against; defaults to `process.cwd()`. */
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

/**
 * Environment key recording the SDKWork values this process injected, as
 * newline-separated `KEY=VALUE` entries. A packaged application resolves its own
 * deployment into `process.env`, and every child process inherits it; this
 * marker is what lets a child tell those values apart from an operator override
 * (SDKWORK-SPECS ENVIRONMENT_SPEC section 5.1.1, "explicit late override with
 * validation and provenance").
 */
export const SDKWORK_INJECTED_ENV_MARKER = 'DSH_SDKWORK_ENV_INJECTED'

/** Whether an environment key carries the SDKWork launch namespace. */
function isSdkworkEnvKey(key: string): boolean {
  return key.startsWith('SDKWORK_') || key.startsWith('VITE_SDKWORK_')
}

/**
 * Record the SDKWork values this process resolved, so descendants can recognize
 * them as another application's deployment rather than their own override.
 * @param env - the environment this process injected into.
 */
export function markInjectedSdkworkEnv(env: Record<string, string | undefined>): void {
  const entries: string[] = []
  for (const key of Object.keys(env).sort()) {
    if (!isSdkworkEnvKey(key)) continue
    const value = env[key]
    if (value === undefined || value === '') continue
    entries.push(`${key}=${value}`)
  }
  if (entries.length > 0) env[SDKWORK_INJECTED_ENV_MARKER] = entries.join('\n')
}

/**
 * Drop inherited SDKWork values that still equal the ones another application
 * injected, so a child launch resolves its own tier instead of the deployment of
 * the process that spawned it. A value the operator changed is kept, and the
 * marker is consumed so later launches do not re-examine cleared values.
 * @param env - the launch environment, mutated in place.
 * @returns the dropped keys, in marker order.
 */
export function clearInheritedInjectedSdkworkEnv(env: Record<string, string | undefined>): string[] {
  const marker = env[SDKWORK_INJECTED_ENV_MARKER]
  if (marker === undefined || marker === '') return []
  const dropped: string[] = []
  for (const entry of marker.split('\n')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) continue
    const key = entry.slice(0, separator)
    if (env[key] !== entry.slice(separator + 1)) continue
    // The keys are marker-driven, so the removal is dynamic by design; assigning
    // `undefined` would leave the key present (`process.env` would stringify it).
    Reflect.deleteProperty(env, key)
    dropped.push(key)
  }
  Reflect.deleteProperty(env, SDKWORK_INJECTED_ENV_MARKER)
  return dropped
}

/**
 * Drop the packaged application's own deployment when it arrives without
 * {@link SDKWORK_INJECTED_ENV_MARKER}. A packaged Desktop application resolves
 * its deployment into `process.env` and every process it spawns inherits it, so
 * a developer launching from that application's integrated shell starts with a
 * complete production identity already set. Builds that predate the marker
 * leave no provenance behind, and without this rule the source launch adopts
 * that deployment: it resolves production, refuses to provision a development
 * bootstrap token, and defers to interactive IAM login against the wrong tier.
 *
 * Only the complete, default-valued production identity is recognized — the
 * production profile id AND the production gateway URL must both be present,
 * and every other deployment key present must still equal its production
 * default. A partially set or customized deployment (a single gateway URL, a
 * lifecycle an operator exported, `SDKWORK_ENVIRONMENT=test`) never matches, so
 * an operator override is never dropped; a developer who genuinely wants
 * production from a source checkout keeps the repository `.env` layer, which is
 * applied after this drop and still selects that lifecycle.
 * @param env - the launch environment, mutated in place.
 * @returns the dropped keys, in production-default key order.
 */
export function dropUnmarkedPackagedProductionDeployment(
  env: Record<string, string | undefined>,
): string[] {
  const defaults = launchDefaultsForEnvironment('production')
  const gatewayKey = 'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL'
  if (env[gatewayKey]?.trim() !== defaults[gatewayKey]) return []
  const profileIdKeys = ['SDKWORK_PROFILE_ID', 'SDKWORK_BIRDCODER_PROFILE_ID'] as const
  if (!profileIdKeys.some(key => env[key]?.trim() === defaults[key])) return []
  for (const [key, value] of Object.entries(defaults)) {
    const current = env[key]?.trim()
    if (current !== undefined && current !== '' && current !== value) return []
  }
  const dropped: string[] = []
  for (const key of Object.keys(defaults)) {
    if (env[key] === undefined) continue
    Reflect.deleteProperty(env, key)
    dropped.push(key)
  }
  return dropped
}

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
 * @returns the nearest ancestor containing `agent.app.config.json`, or `start` when none exists.
 */
export function resolveSdkworkRepoRoot(start: string): string {
  let current = resolve(start)
  for (;;) {
    if (existsSync(resolve(current, 'agent.app.config.json'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

/**
 * Choose the SDKWork gateway profile for a source-aware launcher.
 * A directory tree that contains `agent.app.config.json` is a source
 * checkout (`pnpm dsh web`, `pnpm desktop:dev`) and uses development.
 * Packaged installs, npx, and the container runtime have no such file and
 * use production. The desktop shell still passes an explicit profile because
 * a packaged app may chdir to a homedir that happens to contain a checkout.
 * @param cwd - the invoking directory.
 * @returns `development` inside a source checkout, otherwise `production`.
 */
export function resolveSdkworkLaunchProfile(cwd: string): SdkworkLaunchProfile {
  return existsSync(resolve(resolveSdkworkRepoRoot(cwd), 'agent.app.config.json'))
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
  // Values another application resolved and exported are that application's
  // deployment, not this launch's override: drop them before resolving.
  clearInheritedInjectedSdkworkEnv(env)
  const invoking = resolve(options.cwd)
  const cwd = resolveSdkworkRepoRoot(options.cwd)
  const repoManifest = resolve(cwd, 'agent.app.config.json')
  const sourceCheckout = existsSync(repoManifest)
  if (sourceCheckout && options.profile === 'development') {
    const inherited = dropUnmarkedPackagedProductionDeployment(env)
    if (inherited.length > 0) {
      warn(
        `${PRODUCT_TAG}: ignoring the packaged application's production deployment inherited from this process tree (${inherited.join(', ')}); a source launch resolves its own lifecycle\n`,
      )
    }
  }
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
    // The environment-scoped overlay above is authoritative. The unscoped
    // registration output only fills a still-blank token.
    if (registeredToken && (env.SDKWORK_ACCESS_TOKEN?.trim() ?? '') === '') {
      env.SDKWORK_ACCESS_TOKEN = registeredToken
    }
  }
  return { cwd }
}

/**
 * Ensure a bootstrap access token exists for the declared profile. An
 * explicitly configured `SDKWORK_ACCESS_TOKEN`, the registration output
 * (`.sdkwork.local.env`), and an existing overlay token win without loading
 * `@sdkwork/iam-credential-entry`. Otherwise IAM application bootstrap
 * provisioning runs for every tier when operator credentials allow it
 * (`~/.sdkwork/iam-bootstrap/<lifecycle>.json` or
 * `SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME`/`PASSWORD`), reusing the
 * environment-scoped overlay it writes. Development then generates a
 * disposable local JWT into the gitignored overlay, test requires
 * `allowTestTokenGeneration`, and staging/production fail closed when no
 * credentials provisioned a token. Failures never throw — the caller
 * continues with interactive IAM login as the credential fallback.
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

  // Reuse is the default (SDKWORK-SPECS IAM_APPLICATION_BOOTSTRAP_SPEC 5.4).
  // A configured token that still matches the lifecycle, manifest identity,
  // and gateway is returned without registration or signing; provisioning runs
  // only when no reusable token exists or it expired / belongs elsewhere.
  const manifestIdentity = readBootstrapManifestIdentity(cwd)
  const reusable = (token: string): boolean =>
    isReusableConfiguredBootstrapToken(token, profile, env, manifestIdentity)
  const configured = env.SDKWORK_ACCESS_TOKEN?.trim()
  if (configured !== undefined && configured !== '') {
    if (reusable(configured)) {
      return { status: 'configured' }
    }
    warn(`${PRODUCT_TAG}: ignoring the stale or incompatible bootstrap access token in the launch environment\n`)
    delete (env as Record<string, string | undefined>).SDKWORK_ACCESS_TOKEN
  }

  const registered = readAccessTokenEnvFile(resolve(cwd, REGISTERED_ENV_FILE), warn)
  if (registered !== undefined) {
    if (reusable(registered)) {
      return { status: 'registered', token: registered }
    }
    warn(`${PRODUCT_TAG}: ignoring the stale or incompatible bootstrap access token in ${REGISTERED_ENV_FILE}\n`)
  }
  const overlayPath = bootstrapLocalEnvPath(cwd, profile.environment)
  const existing = readAccessTokenEnvFile(overlayPath, warn)
  if (existing !== undefined) {
    if (reusable(existing)) {
      return { status: 'generated', path: overlayPath, token: existing }
    }
    warn(`${PRODUCT_TAG}: regenerating the stale or incompatible bootstrap access token at ${overlayPath}\n`)
  }

  // Provisioning runs for every tier when operator credentials allow it
  // (IAM_APPLICATION_BOOTSTRAP_SPEC section 5.4.3: the IAM application
  // bootstrap path runs before fixture generation, and the fail-closed rule
  // binds fixture generation only). A staging/production launch without
  // credentials — or with failed provisioning — still fails closed below.
  const provisioned = await tryProvisionRegisteredBootstrapToken({
    cwd,
    env,
    profile,
    warn,
    allowAttempt: options.tryApplicationBootstrap !== false,
  })
  if (provisioned !== undefined) return provisioned

  if (profile.environment === 'staging' || profile.environment === 'production') {
    warn(`${PRODUCT_TAG}: ${profile.environment} bootstrap access tokens must be provisioned by a private secret source — write ~/.sdkwork/iam-bootstrap/<lifecycle>.json or export SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME/PASSWORD; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'production/staging tokens must come from a private secret source' }
  }
  if (profile.environment === 'test' && options.allowTestTokenGeneration !== true) {
    warn(`${PRODUCT_TAG}: test bootstrap token generation requires --allow-test-token-generation; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'test token generation requires allowTestTokenGeneration' }
  }
  if (!fixtureBootstrapTokenAllowed(env)) {
    warn(`${PRODUCT_TAG}: refusing to generate a local fixture bootstrap token outside the development tier on a non-loopback SDKWork gateway; provision a real token with \`pnpm run admin:bootstrap:app\`\n`)
    return { status: 'unavailable', reason: 'fixture bootstrap tokens outside the development tier require a loopback SDKWork gateway' }
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
    return { status: 'unavailable', reason: `no agent.app.config.json: ${String(error)}` }
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
    token = credentialEntry.buildBootstrapAccessTokenEnvRecord(existing ?? '', {
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

/**
 * Diagnostic for a bootstrap token the active launch cannot use: a disposable
 * local fixture whose tier or gateway forbids it.
 * @param subject - where the token was found (launch environment, env file, overlay).
 * @returns the warning line, without its trailing newline.
 */
function unusableTokenWarning(subject: string): string {
  return `${PRODUCT_TAG}: ignoring the bootstrap access token in ${subject}: the active SDKWork launch cannot use`
    + ' a disposable local fixture; provision a real token with `pnpm run admin:bootstrap:app`'
}

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

function gatewayUrlForEnvironment(
  environment: SdkworkLifecycleEnvironment,
  env: Record<string, string | undefined> = process.env,
): string {
  switch (environment) {
    case 'development': {
      // APP_RUNTIME_TOPOLOGY_SPEC section 4.2 / SDK_SPEC section 5.1 step 2:
      // local development binds the local platform gateway (ip:port); the
      // domain family remains the build/package default.
      const localGateway = env.VITE_SDKWORK_LOCAL_PLATFORM_API_GATEWAY_HTTP_URL?.trim()
        || env.SDKWORK_LOCAL_PLATFORM_API_GATEWAY_HTTP_URL?.trim()
      return localGateway || SDKWORK_DEVELOPMENT_GATEWAY_URL
    }
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
  warn(`${unusableTokenWarning('the profile overlay')}\n`)
  const filtered = { ...overlay }
  delete filtered.SDKWORK_ACCESS_TOKEN
  return filtered
}

function isUnusableBootstrapAccessToken(
  env: Readonly<Record<string, string | undefined>>,
  token: string,
): boolean {
  const profile = resolveSdkworkBootstrapProfile(env)
  if (profile !== undefined && !isReusableConfiguredBootstrapToken(token, profile, env)) {
    return true
  }
  if (!looksLikeLocalFixtureJwt(token)) return false
  return !fixtureBootstrapTokenAllowed(env)
}

/**
 * Decode JWT claims without verifying or re-signing anything. A non-JWT value
 * returns `undefined` and is treated as opaque operator material.
 * @param token - raw token.
 * @returns decoded claims when the token is a three-part JWT.
 */
function decodeBootstrapJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    const normalized = (parts[1] ?? '').replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** The manifest identity fields the token reuse checks compare against. */
interface BootstrapManifestIdentity {
  /** `backend.appId` when present. */
  appId?: string | undefined
  /** `backend.tenantId` when present. */
  tenantId?: string | undefined
  /** `backend.organizationId` when present. */
  organizationId?: string | undefined
}

/**
 * Read the manifest application identity for reuse checks without requiring the
 * optional credential-entry package.
 * @param cwd - repository/manifest root.
 * @returns the declared `backend` identity fields.
 */
function readBootstrapManifestIdentity(cwd: string): BootstrapManifestIdentity {
  try {
    const manifest = JSON.parse(readFileSync(resolve(cwd, 'agent.app.config.json'), 'utf8')) as {
      backend?: { appId?: unknown; tenantId?: unknown; organizationId?: unknown }
    }
    const read = (value: unknown): string | undefined => {
      const text = typeof value === 'string' ? value.trim() : ''
      return text === '' ? undefined : text
    }
    return {
      appId: read(manifest.backend?.appId),
      tenantId: read(manifest.backend?.tenantId),
      organizationId: read(manifest.backend?.organizationId),
    }
  } catch {
    return {}
  }
}

/**
 * Whether a configured token can be reused for the selected launch profile.
 *
 * Reuse requires an unexpired token whose environment and tenant identity match
 * the profile and manifest, and whose fixture class is legal for the active
 * gateway (`IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.2). Opaque values are
 * preserved because they cannot be proven stale. The `app_id` claim is accepted
 * as opaque unless it equals the manifest `backend.appId`: the platform IAM
 * issues credentials carrying the runtime application id assigned at
 * registration (an `app_<uuid>` value), which is never the manifest key, so a
 * mismatch cannot prove the token belongs to another application. Tenant and
 * organization claims carry the cross-application isolation instead, and a
 * token minted by the wrong gateway fails at request time and is regenerated
 * then (section 5.4.3).
 * @param token - candidate token.
 * @param profile - resolved deployment profile.
 * @param env - launch environment, for gateway checks.
 * @param manifestIdentity - manifest `backend` identity fields, when declared.
 * @returns whether the token may be reused unchanged.
 */
function isReusableConfiguredBootstrapToken(
  token: string,
  profile: SdkworkBootstrapProfile,
  env: Readonly<Record<string, string | undefined>>,
  manifestIdentity?: BootstrapManifestIdentity,
): boolean {
  const normalized = token.trim()
  if (normalized === '') return false
  const claims = decodeBootstrapJwtClaims(normalized)
  if (claims === undefined) return true
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (typeof claims.exp === 'number' && nowSeconds >= claims.exp - 300) return false
  if (typeof claims.nbf === 'number' && nowSeconds < claims.nbf - 300) return false
  const claimedEnvironment = typeof claims.environment === 'string'
    ? normalizeLifecycle(claims.environment)
    : undefined
  if (claims.environment !== undefined && claimedEnvironment !== profile.environment) return false
  const claimText = (value: unknown): string | undefined => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text === '' ? undefined : text
  }
  if (
    manifestIdentity?.tenantId !== undefined
    && claimText(claims.tenant_id) !== undefined
    && claimText(claims.tenant_id) !== manifestIdentity.tenantId
  ) {
    return false
  }
  if (
    manifestIdentity?.organizationId !== undefined
    && claimText(claims.organization_id) !== undefined
    && claimText(claims.organization_id) !== manifestIdentity.organizationId
  ) {
    return false
  }
  if (looksLikeLocalFixtureJwt(normalized) && !fixtureBootstrapTokenAllowed(env)) return false
  return true
}

/**
 * Whether the launch may use the disposable local bootstrap JWT the shared
 * generator issues. The development tier may, wherever its gateway lives:
 * `ENVIRONMENT_SPEC.md` section 6.1 gives development "may generate a disposable
 * local JWT" with no locality clause, the tracked `.env.standalone.development`
 * names the shared development gateway, and that gateway accepts the generated
 * fixture (it answers 401 without an `Access-Token` and 200 with it). Every
 * other tier keeps the loopback requirement, and staging/production fail closed
 * before this point.
 * @param env - the launch environment.
 * @returns whether the disposable local JWT is usable for this launch.
 */
function fixtureBootstrapTokenAllowed(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (resolveSdkworkBootstrapProfile(env)?.environment === 'development') return true
  return loopbackBootstrapTokenAllowed(env)
}

/** Whether the launch targets a loopback SDKWork gateway. */
function loopbackBootstrapTokenAllowed(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const baseUrl = firstDefined(env, SDKWORK_BASE_URL_KEYS)
  if (baseUrl === undefined) return false
  try {
    return isLoopbackGatewayHostname(new URL(baseUrl).hostname)
  } catch {
    return false
  }
}

/** Strip the brackets an IPv6 URL host arrives in, and case-fold the name. */
function normalizeGatewayHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

/** Whether a hostname is a loopback name or a `127.0.0.0/8` literal. */
function isLiteralLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') return true
  const octets = hostname.split('.')
  if (octets.length !== 4) return false
  return octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) && octets[0] === '127'
}

/** Path of the system hosts file for the current platform. */
function systemHostsPath(): string {
  return process.platform === 'win32'
    ? resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32/drivers/etc/hosts')
    : '/etc/hosts'
}

/**
 * Collect the hostnames the system hosts file maps to a loopback address.
 *
 * A developer publishes the local platform gateway under the tier's domain by
 * mapping that domain to `127.0.0.1`, so the gateway URL keeps its canonical
 * form while every connection still goes to this machine. Comparing the
 * hostname as text cannot see that mapping and refuses the local fixture token
 * for a gateway that is in fact local; this is the resolution the text
 * comparison is missing. Non-loopback mappings are ignored, so a hosts entry
 * that redirects a domain to a remote machine changes nothing.
 * @param content - the hosts file's text.
 * @returns the case-folded loopback hostnames it declares.
 */
export function parseHostsLoopbackNames(content: string): Set<string> {
  const names = new Set<string>()
  for (const line of content.split('\n')) {
    const fields = line.split('#')[0]?.trim().split(/\s+/).filter(Boolean) ?? []
    const [address, ...hostnames] = fields
    if (address === undefined || !isLiteralLoopbackHostname(address.toLowerCase())) continue
    for (const hostname of hostnames) names.add(normalizeGatewayHostname(hostname))
  }
  return names
}

/**
 * Whether a gateway hostname reaches this machine, directly or through the
 * system hosts file.
 * @param hostname - the hostname of the active SDKWork gateway URL.
 * @param hostsContent - hosts-file text to consult; defaults to the system hosts file.
 * @returns true for a loopback literal and for a hosts-mapped loopback name.
 */
export function isLoopbackGatewayHostname(hostname: string, hostsContent?: string): boolean {
  const normalized = normalizeGatewayHostname(hostname)
  if (isLiteralLoopbackHostname(normalized)) return true
  let content = hostsContent
  if (content === undefined) {
    try {
      content = readFileSync(systemHostsPath(), 'utf8')
    } catch {
      // An unreadable hosts file cannot prove the gateway is local, so the
      // fixture path stays closed rather than granting a token on a guess.
      return false
    }
  }
  return parseHostsLoopbackNames(content).has(normalized)
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
    return await import('@sdkwork/iam-application-bootstrap')
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

  const manifestPath = resolve(options.cwd, 'agent.app.config.json')
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

async function importCredentialEntry(
  warn: (line: string) => void,
): Promise<CredentialEntryModule | undefined> {
  try {
    return await import('@sdkwork/iam-credential-entry/node-bootstrap')
  } catch (error) {
    // Optional sibling: a harness without SDKWork checkouts still boots, and
    // an existing overlay/registration token is already applied above.
    warn(`${PRODUCT_TAG}: @sdkwork/iam-credential-entry is unavailable (${String(error)}); bootstrap token generation is skipped\n`)
    return undefined
  }
}
