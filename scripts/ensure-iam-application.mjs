#!/usr/bin/env node
/**
 * `iam:ensure` — provision this product's IAM tenant applications.
 *
 * The harness authenticates to the SDKWork platform as `sdkwork-birdcoder`
 * under tenant `100001`; without a matching enabled `iam_tenant_application`
 * row the platform answers `runtime appId sdkwork-birdcoder is not provisioned
 * for tenant 100001`. This step registers the root manifest and every `apps/*`
 * surface manifest through `crates/sdkwork-birdcoder2-iam-application-bootstrap`
 * (the same embedded bootstrap the platform gateway runs for its own root), so
 * a fresh database, a reset, or a new checkout converges without a manual
 * registration call.
 *
 * It is deliberately tolerant about the environment it runs in and strict about
 * the work it does:
 * - no workspace PostgreSQL profile (process env or `.env.postgres`) — the
 *   provisioning has nothing to target, so the step reports and skips;
 * - no `cargo` on PATH — this repository's pnpm flows do not otherwise require
 *   the Rust toolchain, so the step reports and skips instead of turning a
 *   missing toolchain into a build failure;
 * - a configured database and a working toolchain — the provisioning runs and
 *   its failure fails this step, because that state is a real misconfiguration.
 * @module scripts/ensure-iam-application
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  applySdkworkLaunchEnv,
  resolveSdkworkLaunchProfile,
} from '../packages/boot/sdkwork-env-bootstrap/src/index.ts'

const NAME = 'iam:ensure'
const CRATE = 'sdkwork-birdcoder2-iam-application-bootstrap'
const BIN = 'sdkwork-birdcoder2-iam'
const root = resolve(import.meta.dirname, '..')

// The recorded lifecycle is the checkout's own, not whatever the launching
// shell inherited: a packaged Desktop application exports its deployment into
// every child process, and an unmarked production environment would otherwise
// register these applications under the wrong tier. This is the same first step
// `admin:bootstrap:app` and the launch paths take.
applySdkworkLaunchEnv({
  cwd: process.cwd(),
  profile: resolveSdkworkLaunchProfile(process.cwd()),
  env: process.env,
})

/**
 * Whether the process or this repository declares a workspace database profile.
 *
 * Mirrors the shared `workspace_postgres_env_is_configured()` predicate the
 * provisioning binary itself consults, so both agree on when there is nothing
 * to do.
 * @returns true when a PostgreSQL profile can be resolved.
 */
function workspaceDatabaseConfigured() {
  if (process.env.SDKWORK_DATABASE_URL?.trim()) return true
  if (process.env.SDKWORK_DATABASE_HOST?.trim() && process.env.SDKWORK_DATABASE_NAME?.trim()) return true
  return existsSync(resolve(root, '.env.postgres'))
}

if (!workspaceDatabaseConfigured()) {
  process.stdout.write(`${NAME}: no workspace PostgreSQL profile; tenant applications already resolve without provisioning\n`)
  process.exit(0)
}

// `stdio: 'ignore'` probes the toolchain without capturing a child's pipes.
const probe = spawnSync('cargo', ['--version'], { cwd: root, stdio: 'ignore' })
if (probe.error !== undefined || probe.status !== 0) {
  process.stdout.write(`${NAME}: cargo is unavailable; skipping tenant application provisioning\n`)
  process.exit(0)
}

const run = spawnSync('cargo', ['run', '--quiet', '-p', CRATE, '--bin', BIN], {
  cwd: root,
  stdio: 'inherit',
})
if (run.error !== undefined) {
  process.stderr.write(`${NAME}: failed to launch cargo: ${run.error.message}\n`)
  process.exit(1)
}
process.exit(run.status ?? 1)
