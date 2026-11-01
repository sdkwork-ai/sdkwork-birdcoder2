#!/usr/bin/env node
/**
 * `dsh-sdkwork-env-bootstrap` — CLI for {@link ensureSdkworkBootstrapToken}:
 * apply the source/dev launch profile (identity keys + gateway), then ensure
 * the SDKWork profile has a bootstrap access token, generating a disposable
 * local JWT for development (and test with `--allow-test-token-generation`)
 * into the user-private credential bundle
 * (`~/.sdkwork/<application-code>/credentials/<profile-id>.json`,
 * `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.1).
 *
 * This command is the `provision` phase (and, with `--refresh`, the `refresh`
 * phase) of sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1: the only supported
 * entry point that may create or replace a cached credential. Every other
 * consumer reuses the cache or fails closed — a build must never regenerate a
 * token an operator already settled.
 *
 * `--environment <tier>` pins the lifecycle instead of deriving it from the
 * invoking directory. It is how a deployment materializes the production (or
 * test) token a packaged desktop release carries: a source checkout would
 * otherwise always resolve the development fixture.
 *
 * `--resolve-only` runs the same resolution in the `resolve` phase: it may
 * reuse a cached token and reports a missing one without creating it. Build
 * lanes use it so preparing artifacts never provisions a credential.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap/bin
 */

import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  materializeEnsuredBootstrapAccessToken,
  normalizeSdkworkLifecycleEnvironment,
  resolveSdkworkLaunchProfile,
  withoutInheritedSdkworkDeployment,
  type SdkworkLifecycleEnvironment,
} from './index.ts'

const ALLOW_TEST_FLAG = '--allow-test-token-generation'
const ENVIRONMENT_FLAG = '--environment'
const REFRESH_FLAG = '--refresh'
const RESOLVE_ONLY_FLAG = '--resolve-only'

/**
 * Read the tier this invocation pins, if any.
 * @param argv - arguments after the script path.
 * @returns the canonical tier, or undefined when the flag is absent.
 * @throws When the flag has no value or names an unsupported lifecycle.
 */
function requestedEnvironment(argv: readonly string[]): SdkworkLifecycleEnvironment | undefined {
  const index = argv.indexOf(ENVIRONMENT_FLAG)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`sdkwork-env: ${ENVIRONMENT_FLAG} requires development, test, staging, or production`)
  }
  const normalized = normalizeSdkworkLifecycleEnvironment(value)
  if (normalized === undefined) {
    throw new Error(`sdkwork-env: ${ENVIRONMENT_FLAG} must be development, test, staging, or production`)
  }
  return normalized
}

const allowTestTokenGeneration = process.argv.includes(ALLOW_TEST_FLAG)
// The `refresh` phase of ENVIRONMENT_SPEC 6.1: this explicit command is the
// only entry point allowed to replace a credential that is still reusable.
const refresh = process.argv.includes(REFRESH_FLAG)
// The `resolve` phase: reuse what the cache holds, never create or replace it.
const resolveOnly = process.argv.includes(RESOLVE_ONLY_FLAG)
const requested = requestedEnvironment(process.argv.slice(2))
const cwd = process.cwd()
// A pinned tier resolves from its own tracked env file and credential bundle,
// so an inherited deployment (another application's gateway/profile) cannot
// decide the token's environment; an exported bootstrap token still wins as the
// operator's input.
const env: Record<string, string | undefined> = requested === undefined
  ? process.env
  : withoutInheritedSdkworkDeployment(process.env)
const { cwd: repoRoot } = applySdkworkLaunchEnv({
  cwd,
  profile: requested ?? resolveSdkworkLaunchProfile(cwd),
  env,
})

const result = await ensureSdkworkBootstrapToken({
  cwd: repoRoot,
  env,
  allowTestTokenGeneration,
  refresh,
  ...resolveOnly ? { credentialWrite: 'forbid' as const } : {},
})

// Materialize an ensured token into the process environment so the ui-sdkwork-env
// host projection (which reads the launch environment synchronously) sees it
// without re-reading the credential bundle.
materializeEnsuredBootstrapAccessToken(result, env)

switch (result.status) {
  case 'unconfigured':
    process.stdout.write('sdkwork-env: no SDKWork profile declared; nothing to ensure\n')
    break
  case 'configured':
    process.stdout.write('sdkwork-env: SDKWORK_ACCESS_TOKEN is configured in the environment\n')
    break
  case 'registered':
    process.stdout.write('sdkwork-env: bootstrap access token available from IAM application bootstrap or the legacy .sdkwork.local.env registration output\n')
    break
  case 'generated':
    process.stdout.write(`sdkwork-env: bootstrap access token ensured at ${result.path}\n`)
    break
  case 'unavailable':
    process.stdout.write(resolveOnly
      ? `sdkwork-env: no reusable bootstrap access token (${result.reason}); \`--resolve-only\` never creates one\n`
      : `sdkwork-env: no bootstrap access token ensured (${result.reason}); deferring to interactive IAM login\n`)
    break
  default:
    result satisfies never
}

if (requested !== undefined) {
  process.stdout.write(`sdkwork-env: pinned lifecycle ${requested}\n`)
}
if (refresh) {
  process.stdout.write('sdkwork-env: requested replacement of a reusable bootstrap access token\n')
}
