/**
 * SDKWork bootstrap env glue for the harness app bins: resolve the deployment
 * profile the launch environment declares, apply the desktop launch gateway
 * (`desktop:dev` → `api-dev.birdcoder.com`, packaged → `api.birdcoder.com`),
 * and ensure a bootstrap access token in the gitignored profile overlay,
 * reusing `@sdkwork/iam-credential-entry` for token generation and env-file
 * parsing. Token generation follows sdkwork-specs `ENVIRONMENT_SPEC.md`
 * section 6.1: development may generate a disposable local JWT, test only with
 * an explicit allowance, and staging/production fail closed to a private
 * secret source. The module never copies JWT creation, manifest identity
 * lookup, env merge, bootstrap env-file parsing, or inline serialization —
 * those stay in the canonical SDKWork package.
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

/** File name (repo root) of the IAM application-bootstrap registration output. */
export const REGISTERED_ENV_FILE = '.sdkwork.local.env'

/** Tracked development env materialization at the repository root. */
export const SDKWORK_DEVELOPMENT_ENV_FILE = '.env.standalone.development'

/** Development platform API gateway origin (`api-<tier>.birdcoder.com` off production). */
export const SDKWORK_DEVELOPMENT_GATEWAY_URL = 'https://api-dev.birdcoder.com'

/** Production platform API gateway origin (bare `api.birdcoder.com`). */
export const SDKWORK_PRODUCTION_GATEWAY_URL = 'https://api.birdcoder.com'

/** Desktop launch profile selecting the SDKWork gateway origin. */
export type SdkworkDesktopLaunchProfile = 'development' | 'production'

/** Options for {@link applySdkworkDesktopLaunchEnv}. */
export interface ApplySdkworkDesktopLaunchEnvOptions {
  /** Invoking directory (`apps/desktop` in `pnpm desktop:dev`, the user home when packaged). */
  cwd: string
  /** Unpackaged `desktop:dev` is `development`; a packaged/dist build is `production`. */
  profile: SdkworkDesktopLaunchProfile
  /** Mutable launch environment; defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Sink for one-line diagnostics; defaults to stderr. */
  warn?: (line: string) => void
}

/** Result of {@link applySdkworkDesktopLaunchEnv}. */
export interface AppliedSdkworkDesktopLaunchEnv {
  /**
   * Directory whose `.env` is the project layer: the repository root for
   * development (walked up from `apps/desktop`), the invoking directory for production.
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
 * Fill unset SDKWork identity and gateway URL keys for a desktop launch.
 * Unpackaged `desktop:dev` (`profile: 'development'`) walks to the repository
 * root and applies `.env.standalone.development` (falling back to
 * {@link SDKWORK_DEVELOPMENT_GATEWAY_URL}) so ui-env projects
 * `https://api-dev.birdcoder.com`. A packaged/dist build (`profile: 'production'`)
 * applies {@link SDKWORK_PRODUCTION_GATEWAY_URL}. Empty placeholder values are
 * skipped so a later project `.env` can still supply secrets. Inherited process
 * env values are never replaced.
 * @param options - invoking directory, launch profile, and mutable environment.
 * @returns the directory `loadLayeredEnv` should use as the project layer.
 */
export function applySdkworkDesktopLaunchEnv(
  options: ApplySdkworkDesktopLaunchEnvOptions,
): AppliedSdkworkDesktopLaunchEnv {
  const env = options.env ?? process.env
  const warn = options.warn ?? (line => void process.stderr.write(line))
  if (options.profile === 'production') {
    applyUnset(env, PRODUCTION_DESKTOP_DEFAULTS)
    return { cwd: resolve(options.cwd) }
  }
  const cwd = resolveSdkworkRepoRoot(options.cwd)
  const fromFile = readNonEmptyEnvFile(resolve(cwd, SDKWORK_DEVELOPMENT_ENV_FILE), warn)
  if (fromFile !== undefined) applyUnset(env, fromFile)
  applyUnset(env, DEVELOPMENT_DESKTOP_DEFAULTS)
  return { cwd }
}

/**
 * Ensure a bootstrap access token exists for the declared profile. An
 * explicitly configured `SDKWORK_ACCESS_TOKEN` and the registration output
 * (`.sdkwork.local.env`) win; otherwise development generates a disposable
 * local JWT into the gitignored overlay, test requires
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
  const configured = env.SDKWORK_ACCESS_TOKEN?.trim()
  if (configured) return { status: 'configured' }

  const credentialEntry = await importCredentialEntry()
  if (credentialEntry === undefined) {
    return { status: 'unavailable', reason: 'the @sdkwork/iam-credential-entry package is not installed' }
  }
  const registered = credentialEntry.readBootstrapAccessTokenEnvFile(resolve(cwd, REGISTERED_ENV_FILE))
  if (registered !== undefined) return { status: 'registered', token: registered }
  if (profile.environment === 'staging' || profile.environment === 'production') {
    warn(`${PRODUCT_TAG}: ${profile.environment} bootstrap access tokens must be provisioned by a private secret source; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'production/staging tokens must come from a private secret source' }
  }
  if (profile.environment === 'test' && options.allowTestTokenGeneration !== true) {
    warn(`${PRODUCT_TAG}: test bootstrap token generation requires --allow-test-token-generation; deferring to interactive IAM login\n`)
    return { status: 'unavailable', reason: 'test token generation requires allowTestTokenGeneration' }
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

  const overlayPath = bootstrapLocalEnvPath(cwd, profile.environment)
  const existing = credentialEntry.readBootstrapAccessTokenEnvFile(overlayPath)
  if (existing !== undefined) return { status: 'generated', path: overlayPath, token: existing }

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

/** Unpackaged desktop identity and gateway when `.env.standalone.development` is absent. */
const DEVELOPMENT_DESKTOP_DEFAULTS: Readonly<Record<string, string>> = {
  SDKWORK_ENVIRONMENT: 'development',
  SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_PROFILE_ID: 'standalone.development',
  SDKWORK_BIRDCODER_ENVIRONMENT: 'development',
  SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.development',
  SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_DEVELOPMENT_GATEWAY_URL,
}

/** Packaged desktop identity and gateway matching `.env.standalone.production`. */
const PRODUCTION_DESKTOP_DEFAULTS: Readonly<Record<string, string>> = {
  SDKWORK_ENVIRONMENT: 'production',
  SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_PROFILE_ID: 'standalone.production',
  SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
  SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.production',
  SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
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
  if (deploymentProfile === undefined || environment === undefined || rest.length > 0) return undefined
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

interface CredentialEntryModule {
  SDKWORK_ACCESS_TOKEN_ENV_KEY: string
  readBootstrapAccessTokenEnvFile(path: string): string | undefined
  readApplicationManifest(path: string): unknown
  resolveRepoApplicationManifestPath(repoRoot: string, manifestPath?: string): string
  buildBootstrapAccessTokenEnvRecord(existing: string, options: Record<string, unknown>): Record<string, string>
}

async function importCredentialEntry(): Promise<CredentialEntryModule | undefined> {
  try {
    const module = await import('@sdkwork/iam-credential-entry/node-bootstrap')
    return module
  } catch {
    return undefined
  }
}
