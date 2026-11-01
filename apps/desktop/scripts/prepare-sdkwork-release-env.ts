/**
 * Write the SDKWork release environment a deployment-specific Desktop build
 * carries. The packaging host resolves the deployment from its own repository
 * `.env`, tracked materialization, and gitignored bootstrap overlay, then the
 * installed application reads the artifact before it resolves its deployment,
 * so a release reaches the same SDKWork gateway with the same bootstrap
 * credential the packaging host configured locally.
 *
 * A packaged build must declare its distribution class (sdkwork-specs
 * `ENVIRONMENT_SPEC.md` section 6.1.1):
 *
 * - `deployment` (the default) carries the artifact. It is the class for a
 *   locally built or internally distributed artifact, and it fails this step
 *   when no reusable credential resolves, because an installable application
 *   whose credential forms cannot dispatch is worse than a failed build.
 * - `public` carries nothing, and proves the artifact is absent. The
 *   credential belongs only to one deployment (`ENVIRONMENT_SPEC.md` section
 *   6.1.1), so a general-purpose release must not ship it.
 *
 * Producing the artifact is the `resolve` phase of `ENVIRONMENT_SPEC.md`
 * section 6.1: this step reuses the cached credential and projects it verbatim.
 * It never registers, provisions, signs, or generates one — the only supported
 * way to create or replace a packaged credential is the explicit
 * `pnpm env:token:ensure --environment <lifecycle>` command.
 * @module apps/desktop/scripts/prepare-sdkwork-release-env
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  materializeEnsuredBootstrapAccessToken,
  normalizeSdkworkLifecycleEnvironment,
  renderSdkworkReleaseEnv,
  selectSdkworkReleaseEnv,
  withoutInheritedSdkworkDeployment,
  type SdkworkLifecycleEnvironment,
} from '../../../packages/boot/sdkwork-env-bootstrap/src/index.ts'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')

/**
 * Distribution class of this packaged build, per `ENVIRONMENT_SPEC.md` section
 * 6.1.1. `deployment` carries the release environment; `public` must not.
 */
export type DesktopDistributionClass = 'deployment' | 'public'

/**
 * Packaging setting that selects the distribution class. Unset means
 * `deployment`: the default path must produce an installable artifact that can
 * authenticate, and a public release opts in explicitly from its own lane.
 */
export const SDKWORK_RELEASE_DISTRIBUTION_VARIABLE = 'DSH_DESKTOP_DISTRIBUTION'

/**
 * Legacy opt-in retained for one migration window. `0` maps to `public` and `1`
 * to `deployment`; {@link SDKWORK_RELEASE_DISTRIBUTION_VARIABLE} outranks it.
 */
export const SDKWORK_RELEASE_ENV_OPT_IN = 'DSH_DESKTOP_SDKWORK_RELEASE_ENV'

/** Packaging setting that selects the SDKWork lifecycle tier; defaults to production. */
export const SDKWORK_RELEASE_ENVIRONMENT_VARIABLE = 'DSH_DESKTOP_SDKWORK_ENVIRONMENT'

/** Packaging setting that permits disposable test-tier token generation for this artifact. */
export const SDKWORK_RELEASE_TEST_TOKEN_VARIABLE = 'DSH_DESKTOP_SDKWORK_ALLOW_TEST_TOKEN'

/** Basename of the artifact inside one target's build root and the packaged `resources/` directory. */
export const SDKWORK_RELEASE_ENV_FILENAME = 'sdkwork-release.env'

/** Outcome of one preparation run. */
export interface PrepareSdkworkReleaseEnvResult {
  /** Whether this build must carry the artifact (the `deployment` class). */
  readonly enabled: boolean
  /** Distribution class that decided {@link enabled}. */
  readonly distribution: DesktopDistributionClass
  /** Lifecycle tier the artifact describes. */
  readonly environment: SdkworkLifecycleEnvironment
  /** Absolute artifact path (whether or not it was written). */
  readonly path: string
  /** Names the artifact carries, in serialization order. */
  readonly keys: readonly string[]
}

/** Options for {@link prepareSdkworkReleaseEnv}. */
export interface PrepareSdkworkReleaseEnvOptions {
  /** Packaging environment; defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>
  /** Repository root whose env layers resolve; defaults to this checkout. */
  readonly root?: string
  /** Artifact path; defaults to the selected target's build root. */
  readonly out?: string
  /** Diagnostic sink; defaults to stderr. */
  readonly warn?: (line: string) => void
}

/**
 * Resolve the lifecycle tier this artifact targets.
 * @param env - packaging environment.
 * @returns the canonical lifecycle tier; production when unset.
 * @throws When the configured value is not a supported lifecycle.
 */
export function resolveSdkworkReleaseEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): SdkworkLifecycleEnvironment {
  const configured = env[SDKWORK_RELEASE_ENVIRONMENT_VARIABLE]?.trim()
  if (configured === undefined || configured === '') return 'production'
  const normalized = normalizeSdkworkLifecycleEnvironment(configured)
  if (normalized === undefined) {
    throw new Error(`desktop package: ${SDKWORK_RELEASE_ENVIRONMENT_VARIABLE} must be development, test, staging, or production`)
  }
  return normalized
}

/**
 * Resolve whether this build carries the release environment.
 *
 * `deployment` is the default because a packaged application runs outside any
 * source checkout: without the artifact it resolves the built-in deployment
 * defaults with no credential, and every IAM request fails before dispatch.
 * A public release states its class instead of inheriting the default, which is
 * what makes the omission impossible to reach by accident.
 * @param env - packaging environment.
 * @returns the declared distribution class.
 * @throws When the configured value is neither class, or the legacy opt-in is
 * neither `0` nor `1`.
 */
export function resolveDesktopDistributionClass(
  env: Readonly<Record<string, string | undefined>>,
): DesktopDistributionClass {
  const configured = env[SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]?.trim()
  if (configured !== undefined && configured !== '') {
    if (configured === 'deployment' || configured === 'public') return configured
    throw new Error(`desktop package: ${SDKWORK_RELEASE_DISTRIBUTION_VARIABLE} must be deployment or public`)
  }
  const legacy = env[SDKWORK_RELEASE_ENV_OPT_IN]?.trim()
  if (legacy === undefined || legacy === '') return 'deployment'
  if (legacy !== '0' && legacy !== '1') {
    throw new Error(`desktop package: ${SDKWORK_RELEASE_ENV_OPT_IN} must be 0 or 1`)
  }
  return legacy === '1' ? 'deployment' : 'public'
}

/** @returns the artifact path for the target this packaging run selected. */
function defaultArtifactPath(env: Readonly<Record<string, string | undefined>>): string {
  const target = resolveDesktopBuildTarget(env as NodeJS.ProcessEnv)
  return join(desktopTargetBuildPaths(target, env as NodeJS.ProcessEnv).root, SDKWORK_RELEASE_ENV_FILENAME)
}

/**
 * Resolve the packaging host's SDKWork deployment and project it into the
 * artifact a `deployment` build carries.
 *
 * The host environment outranks this build's configuration, so a value the
 * operator exports or writes into the selected configuration file is baked in,
 * while another application's inherited deployment is dropped before the tier
 * resolves from its own files. The bootstrap credential is only ever reused:
 * when the cache holds no reusable one this step fails with the command that
 * repairs it, instead of provisioning or signing a credential inside a build.
 * @param options - environment, repository root, artifact path, and diagnostic sink.
 * @returns whether the artifact was written and which keys it carries.
 * @throws When a `deployment` build has no reusable bootstrap credential.
 */
export async function prepareSdkworkReleaseEnv(
  options: PrepareSdkworkReleaseEnvOptions = {},
): Promise<PrepareSdkworkReleaseEnvResult> {
  const env = options.env ?? process.env
  const warn = options.warn ?? ((line: string) => { void process.stderr.write(line) })
  const distribution = resolveDesktopDistributionClass(env)
  const environment = resolveSdkworkReleaseEnvironment(env)
  const path = options.out ?? defaultArtifactPath(env)
  if (distribution === 'public') {
    // A path the caller chose is not this tool's to delete; the target-owned
    // artifact must not survive a run that no longer carries a credential.
    if (options.out === undefined && existsSync(path)) {
      rmSync(path, { force: true })
      warn(`desktop package: removed the stale SDKWork release environment at ${path}; a public build carries none\n`)
    }
    return { enabled: false, distribution, environment, path, keys: [] }
  }
  const root = options.root ?? REPOSITORY_ROOT
  const launch: Record<string, string | undefined> = withoutInheritedSdkworkDeployment(env)
  const { cwd } = applySdkworkLaunchEnv({ cwd: root, profile: environment, env: launch, warn })
  const ensured = await ensureSdkworkBootstrapToken({
    cwd,
    env: launch,
    credentialWrite: 'forbid',
    ...environment === 'test' ? { allowTestTokenGeneration: env[SDKWORK_RELEASE_TEST_TOKEN_VARIABLE]?.trim() === '1' } : {},
    warn,
  })
  materializeEnsuredBootstrapAccessToken(ensured, launch)
  const values = selectSdkworkReleaseEnv(launch)
  if (values.SDKWORK_ACCESS_TOKEN === undefined) {
    const reason = ensured.status === 'unavailable' ? ` (${ensured.reason})` : ''
    throw new Error(`desktop package: no reusable SDKWork bootstrap access token resolved for ${environment}${reason}; `
      + 'packaging only projects an existing credential — provision one with '
      + `\`pnpm env:token:ensure --environment ${environment}\``
      + `${ensured.status === 'unavailable' ? ', or declare DSH_DESKTOP_DISTRIBUTION=public for a credential-free release' : ''}`)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, renderSdkworkReleaseEnv(values))
  return { enabled: true, distribution, environment, path, keys: Object.keys(values) }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: 'string' } } })
  const result = await prepareSdkworkReleaseEnv(values.out === undefined ? {} : { out: values.out })
  if (!result.enabled) {
    process.stdout.write(`desktop package: ${result.distribution} distribution carries no SDKWork release environment; `
      + 'the installed application resolves its own deployment and falls back to interactive IAM login\n')
    return
  }
  process.stdout.write(`desktop package: ${result.distribution} SDKWork release environment for ${result.environment} written to ${result.path} `
    + `(${String(result.keys.length)} keys: ${result.keys.join(', ')}; bootstrap token projected, not generated)\n`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
