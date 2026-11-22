#!/usr/bin/env node
/**
 * `admin:repair:installation` — bind an installation to the deploy application it serves.
 *
 * The login and credential flows fail closed when an installation serves no
 * deploy application: the hosted authorization page cannot name the deployment
 * (`POST /app/v3/api/oauth/authorizations` → `not bound to a deploy application`),
 * so the desktop login ends in `server_error`. This command performs the repair
 * through IAM's own API, never through SQL.
 *
 * Two operations do the same additive write, and the command picks the strongest
 * one the deployment serves:
 *
 * 1. `installations.reconcile` — the readiness-driven repair: `dryRun`, a plan,
 *    and the readiness document before/after the write.
 * 2. `installations.update` — the older surface: it fills a **missing** anchor
 *    with the same compare-and-set and refuses to re-point a bound row, but it
 *    cannot preview.
 *
 * Both refuse to change an installation that already serves a different deploy
 * application: that is a deploy identity migration, not a repair.
 *
 * After a write the command re-runs the anonymous authorization bootstrap the
 * hosted login page calls first, so the exit status reports whether the login can
 * start instead of assuming it.
 * @module scripts/bootstrap/repair-installation
 */

import { randomBytes } from 'node:crypto'
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
  AUTHORIZE_BOOTSTRAP_PATH,
  buildReconcileBody,
  buildUpdateBody,
  parseFlags,
  renderReconcileReport,
  renderUpdateReport,
  resolveDeployApplicationId,
} from './installation-repair.ts'

const NAME = 'admin:repair:installation'

/** Reads the `--via` choice; `auto` prefers reconcile and falls back to update. */
function resolveVia(flags) {
  const value = (flags.via ?? 'auto').trim().toLowerCase()
  if (value === 'auto' || value === 'reconcile' || value === 'update') return value
  throw new Error(`${NAME}: --via must be auto, reconcile, or update`)
}

/** Whether a reconcile failure means "this deployment does not serve the route". */
function isMissingRoute(error) {
  const message = error instanceof Error ? error.message : String(error)
  return /not registered|HTTP 40[45]/u.test(message)
}

/**
 * Re-runs the hosted page's anonymous authorization bootstrap.
 *
 * This is the exact request the desktop login page makes first, so it turns
 * "the repair wrote something" into "a login can start now".
 * @returns the status and the server's own detail.
 */
async function verifyAuthorize(backendBaseUrl, clientId, redirectUri) {
  const state = randomBytes(32).toString('base64url')
  const codeChallenge = randomBytes(32).toString('base64url')
  const response = await fetch(new URL(AUTHORIZE_BOOTSTRAP_PATH, backendBaseUrl), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      responseType: 'code',
      redirectUri,
      scope: 'openid profile email offline_access',
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
    }),
  })
  const text = await response.text()
  let detail
  try {
    const payload = JSON.parse(text)
    detail = typeof payload?.detail === 'string' ? payload.detail : undefined
  } catch {
    detail = undefined
  }
  return { status: response.status, detail }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const via = resolveVia(flags)
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
      + 'SDKWORK_TENANT_APPLICATION_ID (the profile\'s SDKWORK_TENANT_APPLICATION_ID)',
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
  const verify = flags['no-verify'] === undefined
  if (dryRun && via === 'update') {
    throw new Error(
      `${NAME}: installations.update has no dry run — use --via auto (or reconcile) for a plan`,
    )
  }

  const backendBaseUrl = flags['backend-url']?.trim()
    ?? process.env.SDKWORK_BACKEND_BASE_URL?.trim()
    ?? process.env.SDKWORK_BIRDCODER_APP_API_BASE_URL?.trim()
    ?? new URL(process.env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL ?? '').origin
  process.stdout.write(
    `${NAME}: installation ${installationId} → deploy application ${deployApplicationId} (${source}) at ${backendBaseUrl}\n`,
  )
  const client = createFetchIamApplicationBootstrapClient({ baseUrl: backendBaseUrl })

  if (flags['verify-only'] !== undefined) {
    const probe = await probeAuthorize(manifest, backendBaseUrl)
    reportProbe(probe)
    return
  }

  let repaired = false
  if (via !== 'update') {
    const reconcile = client.reconcileInstallation?.bind(client)
    if (reconcile === undefined) {
      if (via === 'reconcile') throw new Error(`${NAME}: the client has no reconcileInstallation`)
      process.stdout.write(`${NAME}: client has no reconcile operation; using installations.update\n`)
    } else {
      try {
        const outcome = await reconcile(String(installationId), buildReconcileBody({
          tenantId,
          auth,
          deployApplicationId,
          runtimeConfig,
          enable,
          dryRun,
          idempotencyKey: flags['idempotency-key'],
        }))
        for (const line of renderReconcileReport(outcome, { dryRun })) process.stdout.write(`${line}\n`)
        repaired = outcome?.readinessAfter?.ready === true
        if (dryRun) {
          process.stdout.write(`${NAME}: dry run only — re-run without --dry-run to write\n`)
          process.exitCode = repaired ? 0 : 1
          return
        }
      } catch (error) {
        if (!isMissingRoute(error)) throw error
        if (via === 'reconcile') throw error
        process.stdout.write(
          `${NAME}: this deployment does not serve installations.reconcile; falling back to installations.update\n`,
        )
      }
    }
  }

  if (via === 'update' || !repaired) {
    if (typeof client.updateInstallation !== 'function') {
      throw new Error(`${NAME}: the bootstrap client does not expose updateInstallation`)
    }
    const installation = await client.updateInstallation(String(installationId), buildUpdateBody({
      tenantId,
      auth,
      deployApplicationId,
      runtimeConfig,
    }))
    for (const line of renderUpdateReport(installation, { deployApplicationId })) {
      process.stdout.write(`${line}\n`)
    }
  }

  if (!verify) return
  reportProbe(await probeAuthorize(manifest, backendBaseUrl))
}

/** Runs the hosted page's anonymous authorize bootstrap against the manifest's client. */
async function probeAuthorize(manifest, backendBaseUrl) {
  const relyingParty = manifest?.oauth?.relyingParty ?? {}
  const redirectUri = Array.isArray(relyingParty.redirectUris) && relyingParty.redirectUris.length > 0
    ? relyingParty.redirectUris[0]
    : 'birdcoder://auth/callback'
  return verifyAuthorize(backendBaseUrl, relyingParty.clientId ?? 'birdcoder', redirectUri)
}

/** Prints the probe outcome and sets the exit status from the anchoring defect. */
function reportProbe(probe) {
  process.stdout.write(
    `${NAME}: authorize bootstrap probe → HTTP ${probe.status}`
    + `${probe.detail === undefined ? '' : `: ${probe.detail}`}\n`,
  )
  if ((probe.detail ?? '').includes('not bound to a deploy application')) {
    process.stderr.write(`${NAME}: the installation is still unbound\n`)
    process.exitCode = 1
    return
  }
  if (probe.status >= 400) {
    process.stdout.write(
      `${NAME}: the anchoring defect is gone; the authorize page reports another condition\n`,
    )
    return
  }
  process.stdout.write(`${NAME}: the hosted login can start the authorization again\n`)
}

const invokedDirectly = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
