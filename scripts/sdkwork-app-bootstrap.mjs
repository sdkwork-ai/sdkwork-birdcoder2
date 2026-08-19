#!/usr/bin/env node
/**
 * `admin:bootstrap:app` — IAM application bootstrap for this product root:
 * register the application template, provision and enable the tenant
 * application, and issue the access credential, reusing
 * `@sdkwork/iam-application-bootstrap` (register → provision → enable →
 * access-credential orchestration per IAM_APPLICATION_BOOTSTRAP_SPEC.md).
 * The registration output is written to `.sdkwork.local.env` at the repo
 * root; the startup token ensure step (dsh-sdkwork-env-bootstrap) then uses
 * the issued real token instead of a local fixture JWT.
 *
 * IAM application-bootstrap auth profiles live under `~/.sdkwork/iam-bootstrap/`
 * — for example `development.json` or the shared `default.json` — with legacy
 * fallback under `~/.sdkwork/users/`. Any principal with bootstrap permissions
 * may be stored there (development often uses the platform super-admin account).
 * Environment overrides: `SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME`,
 * `SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD`, `SDKWORK_BACKEND_BASE_URL`.
 * @module scripts/sdkwork-app-bootstrap
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  bootstrapApplicationFromManifest,
  createFetchIamApplicationBootstrapClient,
  formatBootstrapEnvFile,
  hashManifestContent,
  loadBootstrapAuthProfileFromHome,
  resolveBootstrapAuth,
  resolveBootstrapEnvironmentFromEnv,
  resolveBootstrapAuthProfileCandidates,
  resolveBootstrapAuthProfileDir,
  writeRegisteredBootstrapEnvFiles,
} from '@sdkwork/iam-application-bootstrap'

const NAME = 'admin:bootstrap:app'

/** CLI overrides read from `--key value` pairs (and `--key=value`). */
function parseFlags(argv) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg?.startsWith('--')) continue
    const [name, inlineValue] = arg.slice(2).split('=')
    const value = inlineValue ?? argv[index + 1]
    if (name !== undefined && value !== undefined) {
      flags[name] = value
      if (inlineValue === undefined) index += 1
    }
  }
  return flags
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const manifestPath = resolve(process.cwd(), flags.config ?? 'sdkwork.app.config.json')
  const envOutPath = resolve(process.cwd(), flags['env-out'] ?? '.sdkwork.local.env')

  let raw
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch (error) {
    throw new Error(`${NAME}: failed to read manifest ${manifestPath}: ${String(error)}`)
  }
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${NAME}: ${manifestPath} is not valid JSON: ${String(error)}`)
  }

  const environment = resolveBootstrapEnvironmentFromEnv(process.env, {
    backendApiBaseUrl: flags['backend-base-url'],
    environment: flags.environment ?? mapLifecycleFlag(flags.profile),
    instanceKey: flags['instance-key'],
    organizationId: flags['organization-id'],
    primaryDomain: flags.domain,
    tenantId: flags['tenant-id'],
  })
  const envRecord = process.env
  const bootstrapAuthProfile = await loadBootstrapAuthProfileFromHome({
    env: envRecord,
    profileName: flags['bootstrap-profile'] ?? flags['operator-profile'] ?? flags['super-admin-profile'],
    lifecycleEnvironment: mapLifecycleForProfile(envRecord, flags.profile),
    profileId: envRecord.SDKWORK_PROFILE_ID ?? envRecord.SDKWORK_BIRDCODER_PROFILE_ID,
  })
  const auth = resolveBootstrapAuth({ env: envRecord, profile: bootstrapAuthProfile?.profile ?? null })
  if (!hasBootstrapAuthCredentials(auth)) {
    const candidates = resolveBootstrapAuthProfileCandidates({
      env: envRecord,
      profileName: flags['bootstrap-profile'] ?? flags['operator-profile'] ?? flags['super-admin-profile'],
      lifecycleEnvironment: mapLifecycleForProfile(envRecord, flags.profile),
      profileId: envRecord.SDKWORK_PROFILE_ID ?? envRecord.SDKWORK_BIRDCODER_PROFILE_ID,
    })
    const profileDir = resolveBootstrapAuthProfileDir(envRecord)
    throw new Error(
      `${NAME}: no IAM bootstrap auth credentials — write ${profileDir}/${candidates[0] ?? 'development'}.json `
      + `(candidates: ${candidates.join(', ')}) or export SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME/SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD`,
    )
  }

  const client = createFetchIamApplicationBootstrapClient({
    baseUrl: environment.backendApiBaseUrl,
  })
  const result = await bootstrapApplicationFromManifest({
    manifest,
    manifestHash: hashManifestContent(raw),
    environment,
    auth,
    client,
    profile: bootstrapAuthProfile?.profile ?? null,
  })

  const header = '# SDKWork IAM application-bootstrap registration output (gitignored).\n'
  const contents = header + formatBootstrapEnvFile({ result, primaryDomain: environment.primaryDomain })
  if (flags['env-out']) {
    writeFileSync(envOutPath, contents)
  } else {
    await writeRegisteredBootstrapEnvFiles(process.cwd(), contents, environment.environment)
  }
  const appKey = typeof manifest?.app?.key === 'string' ? manifest.app.key : 'app'
  process.stdout.write(
    `${NAME}: registered ${appKey} for ${environment.environment} at ${environment.backendApiBaseUrl}; `
    + `tenant application ${result.tenantApplicationId}; wrote ${envOutPath}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})

/** Map `--profile development` style flags to IAM bootstrap environment codes. */
function mapLifecycleFlag(profile) {
  switch ((profile ?? '').trim().toLowerCase()) {
    case 'development':
    case 'dev':
      return 'dev'
    case 'production':
    case 'prod':
      return 'prod'
    case 'test':
    case 'staging':
      return profile.trim().toLowerCase()
    default:
      return undefined
  }
}

/** Resolve lifecycle name for operator-profile lookup. */
function mapLifecycleForProfile(env, profileFlag) {
  const fromFlag = (profileFlag ?? '').trim().toLowerCase()
  if (fromFlag === 'dev') return 'development'
  if (fromFlag === 'prod') return 'production'
  if (fromFlag === 'development' || fromFlag === 'test' || fromFlag === 'staging' || fromFlag === 'production') {
    return fromFlag
  }
  const fromEnv = (env.SDKWORK_ENVIRONMENT ?? env.SDKWORK_BIRDCODER_ENVIRONMENT ?? '').trim().toLowerCase()
  if (fromEnv === 'dev') return 'development'
  if (fromEnv === 'prod') return 'production'
  if (fromEnv === 'development' || fromEnv === 'test' || fromEnv === 'staging' || fromEnv === 'production') {
    return fromEnv
  }
  const profileId = (env.SDKWORK_PROFILE_ID ?? env.SDKWORK_BIRDCODER_PROFILE_ID ?? '').trim()
  const lifecycle = profileId.split('.')[1]
  if (lifecycle === 'dev') return 'development'
  if (lifecycle === 'prod') return 'production'
  if (lifecycle) return lifecycle
  return 'development'
}

function hasBootstrapAuthCredentials(auth) {
  if (auth.authToken?.trim()) return true
  const username = auth.username ?? auth.email
  return Boolean(username?.trim() && auth.password?.trim())
}
