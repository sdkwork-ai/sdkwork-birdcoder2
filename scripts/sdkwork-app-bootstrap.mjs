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
 * Super-admin bootstrap credentials come from `~/.sdkwork/users/super-admin.json`
 * or the environment (`SDKWORK_BACKEND_BASE_URL`,
 * `SDKWORK_IAM_SUPER_ADMIN_USERNAME`, `SDKWORK_IAM_SUPER_ADMIN_PASSWORD`).
 * @module scripts/sdkwork-app-bootstrap
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  bootstrapApplicationFromManifest,
  createIamApplicationBootstrapClientFromAppbaseBackendSdk,
  formatBootstrapEnvFile,
  hashManifestContent,
  loadBootstrapProfileFromHome,
  resolveBootstrapAuthFromEnv,
  resolveBootstrapEnvironmentFromEnv,
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
    environment: flags.environment,
    instanceKey: flags['instance-key'],
    organizationId: flags['organization-id'],
    primaryDomain: flags.domain,
    tenantId: flags['tenant-id'],
  })
  const auth = resolveBootstrapAuthFromEnv(process.env)
  const profile = await loadBootstrapProfileFromHome()
  if (auth.authToken === undefined && auth.username === undefined && profile === null) {
    throw new Error(
      `${NAME}: no super-admin bootstrap credentials — write ~/.sdkwork/users/super-admin.json or export SDKWORK_IAM_SUPER_ADMIN_USERNAME/SDKWORK_IAM_SUPER_ADMIN_PASSWORD`,
    )
  }

  const client = createIamApplicationBootstrapClientFromAppbaseBackendSdk({
    baseUrl: environment.backendApiBaseUrl,
  })
  const result = await bootstrapApplicationFromManifest({
    manifest,
    manifestHash: hashManifestContent(raw),
    environment,
    auth,
    client,
    profile,
  })

  const header = '# SDKWork IAM application-bootstrap registration output (gitignored).\n'
  writeFileSync(envOutPath, header + formatBootstrapEnvFile({ result, primaryDomain: environment.primaryDomain }))
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
