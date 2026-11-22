#!/usr/bin/env node
/**
 * `admin:repair:installation` — readiness-driven repair of one installation.
 *
 * The login and credential flows fail closed when an installation serves no
 * deploy application: the hosted authorization page cannot name the deployment,
 * so the desktop login ends in `server_error` and an access-token issue ends in
 * `installation is not bound to a deploy application`. This command calls the
 * IAM backend's reconcile operation — the audited, compare-and-set repair — with
 * the anchor this checkout already knows, so the operator does not have to
 * construct a provisioning request by hand.
 *
 * The operation is idempotent and additive by construction: it binds a **missing**
 * anchor only (never re-points), applies only the runtime config given here, and
 * enables the lifecycle only when asked. A dry run prints the same plan without
 * writing, and both documents (before/after) come back in one response, so the
 * command reports the remaining defects instead of guessing.
 *
 * Authentication is the IAM bootstrap profile: `~/.sdkwork/iam-bootstrap/<stem>.json`
 * (`username`/`email` + `password`) or `SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME` /
 * `SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD`. The credential travels in the request
 * body because the route is a bootstrap-body operation.
 * @module scripts/bootstrap/repair-installation
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  applySdkworkLaunchEnv,
  resolveSdkworkLaunchProfile,
} from '../../packages/boot/sdkwork-env-bootstrap/src/index.ts'
import {
  createFetchIamApplicationBootstrapClient,
  loadBootstrapAuthProfileFromHome,
  resolveBootstrapAuth,
} from '@sdkwork/iam-application-bootstrap'
import {
  buildReconcileBody,
  parseFlags,
  renderReconcileReport,
  resolveDeployApplicationId,
} from './installation-repair.ts'

const NAME = 'admin:repair:installation'

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const { cwd: repoRoot } = applySdkworkLaunchEnv({
    cwd: process.cwd(),
    profile: resolveSdkworkLaunchProfile(process.cwd()),
    env: process.env,
  })
  const manifestPath = resolve(repoRoot, flags.config ?? 'agent.app.config.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const tenantId = flags['tenant-id'] ?? process.env.SDKWORK_TENANT_ID
    ?? manifest?.backend?.tenantId
  const installationId = flags['installation-id'] ?? process.env.SDKWORK_TENANT_APPLICATION_ID
  if (installationId === undefined || String(installationId).trim() === '') {
    throw new Error(
      `${NAME}: no installation id — pass --installation-id or export `
      + `SDKWORK_TENANT_APPLICATION_ID (the profile's SDKWORK_TENANT_APPLICATION_ID)`,
    )
  }
  const { deployApplicationId, source } = resolveDeployApplicationId({
    flag: flags['deploy-application-id'],
    env: process.env,
    manifest,
  })
  const profile = await loadBootstrapAuthProfileFromHome({
    env: process.env,
    lifecycleEnvironment: process.env.SDKWORK_ENVIRONMENT ?? undefined,
    profileId: process.env.SDKWORK_PROFILE_ID ?? undefined,
  })
  const auth = resolveBootstrapAuth({ env: process.env, profile: profile?.profile ?? null })
  const runtimeConfig = flags['runtime-config'] === undefined
    ? undefined
    : JSON.parse(readFileSync(resolve(repoRoot, flags['runtime-config']), 'utf8'))
  const dryRun = flags['dry-run'] !== undefined
  const enable = flags['no-enable'] === undefined
  const body = buildReconcileBody({
    tenantId,
    auth,
    deployApplicationId,
    runtimeConfig,
    enable,
    dryRun,
    idempotencyKey: flags['idempotency-key'],
  })

  const backendBaseUrl = process.env.SDKWORK_BACKEND_BASE_URL?.trim()
    ?? process.env.SDKWORK_BIRDCODER_APP_API_BASE_URL?.trim()
    ?? new URL(process.env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL ?? '').origin
  process.stdout.write(
    `${NAME}: installation ${installationId} → deploy application ${deployApplicationId} (${source}) at ${backendBaseUrl}\n`,
  )
  const client = createFetchIamApplicationBootstrapClient({ baseUrl: backendBaseUrl })
  if (typeof client.reconcileInstallation !== 'function') {
    throw new Error(`${NAME}: the bootstrap client does not expose reconcileInstallation`)
  }
  const outcome = await client.reconcileInstallation(String(installationId), body)
  for (const line of renderReconcileReport(outcome, { dryRun })) process.stdout.write(`${line}\n`)
  if (outcome?.readinessAfter?.ready !== true) process.exitCode = 1
}

const invokedDirectly = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
