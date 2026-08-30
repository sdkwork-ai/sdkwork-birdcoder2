#!/usr/bin/env node
/**
 * Multi-environment desktop launcher. Resolves the SDKWork launch environment
 * (`development | test | staging | production`), projects it into the child
 * process environment, and runs one of two steps:
 *
 *   electron — spawn the Electron shell against apps/desktop (debug runs)
 *   ensure   — run the SDKWork bootstrap-token ensurer so the frozen launch
 *              snapshot carries an access token (test adds
 *              `--allow-test-token-generation`; staging/production defer to
 *              interactive IAM login, exactly like the packaged launcher)
 *
 * Usage:
 *   node scripts/run-desktop.mjs electron --env test
 *   node scripts/run-desktop.mjs ensure --env development
 *
 * Every `desktop:<env>` / `dist:<env>` script funnels through this launcher so
 * the environment name is resolved and validated in exactly one place. The
 * chosen environment is also exported as `SDKWORK_ENVIRONMENT` /
 * `SDKWORK_BIRDCODER_ENVIRONMENT`; the Electron main reads it to isolate
 * userData + harness home per environment (see src/main.ts).
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
/** apps/desktop — the Electron working directory and package anchor. */
const APPS_DESKTOP = resolve(scriptDir, '..')
/** Repository root — where the sdkwork.app.config.json manifests live. */
const REPO_ROOT = resolve(APPS_DESKTOP, '..', '..')

/** Canonical lifecycle environments, with the same aliases as the env-bootstrap package. */
const CANONICAL_ENVIRONMENT = {
  dev: 'development',
  development: 'development',
  test: 'test',
  staging: 'staging',
  prod: 'production',
  production: 'production',
}

/** The bootstrap-token ensurer source entry (mirrors the root `env:token:ensure` script). */
const ENV_BOOTSTRAP_ENTRY = join(REPO_ROOT, 'packages', 'boot', 'sdkwork-env-bootstrap', 'src', 'bin.ts')

function fail(message) {
  console.error(`run-desktop: ${message}`)
  console.error('usage: node scripts/run-desktop.mjs <electron|ensure> [--env <dev|development|test|staging|prod|production>]')
  process.exit(1)
}

/** Parse `--env <name>` / `--env=<name>` out of the argument list. */
function parseEnvironment(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    let value
    if (arg === '--env') {
      value = argv[i + 1]
    } else if (arg.startsWith('--env=')) {
      value = arg.slice('--env='.length)
    }
    if (value === undefined) continue
    const canonical = CANONICAL_ENVIRONMENT[value.toLowerCase()]
    if (canonical === undefined) {
      fail(`unknown environment '${value}' (expected dev|development|test|staging|prod|production)`)
    }
    return canonical
  }
  return 'development'
}

const [command] = process.argv.slice(2)
const environment = parseEnvironment(process.argv.slice(2))

if (command !== 'electron' && command !== 'ensure') {
  fail(`unknown command '${command}'`)
}

// The chosen environment is the single source of truth for the whole launch
// chain: the Electron main (userData + DSH_HOME isolation) and the env
// bootstrap (which tier's .env.standalone.<env> overlay to load). The full
// profile-key set is exported — the bootstrap's `resolveSdkworkBootstrapProfile`
// prefers SDKWORK_PROFILE_ID over SDKWORK_ENVIRONMENT, and the repo-root .env
// layer only fills unset keys, so leaving the profile id blank would let a
// stray `SDKWORK_PROFILE_ID=standalone.development` in .env silently defeat
// `--env test` / `--env staging`.
process.env.SDKWORK_ENVIRONMENT = environment
process.env.SDKWORK_BIRDCODER_ENVIRONMENT = environment
process.env.SDKWORK_DEPLOYMENT_PROFILE = 'standalone'
process.env.SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE = 'standalone'
process.env.SDKWORK_PROFILE_ID = `standalone.${environment}`
process.env.SDKWORK_BIRDCODER_PROFILE_ID = `standalone.${environment}`

if (command === 'ensure') {
  // cwd at the repo root so the bootstrap walks to sdkwork.app.config.json.
  const args = ['--import', 'tsx/esm', ENV_BOOTSTRAP_ENTRY]
  if (environment === 'test') args.push('--allow-test-token-generation')
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  // `ELECTRON_RUN_AS_NODE` forces electron.exe into plain-Node mode: the
  // built-in `electron` module disappears, so the ESM main's
  // `import ... from 'electron'` resolves to the npm package (whose index.js
  // merely exports the binary path), and on Electron <=36 that CJS package
  // even crashes Node 22's ESM-CJS translator (cjsPreparseModuleExports:
  // cannot read 'exports' of undefined). Shells and sandboxes (WorkBuddy
  // bash, CI) commonly inject it; the app must always run as Electron.
  delete process.env.ELECTRON_RUN_AS_NODE
  // Resolve the Electron binary through the app's own dependency tree (the
  // package main exports the executable path) — no reliance on .bin shims.
  const requireFromApp = createRequire(join(APPS_DESKTOP, 'package.json'))
  const electronPath = requireFromApp('electron')
  // `--disable-gpu` keeps dev runs alive on GPU-less hosts (sandboxes, VMs,
  // remote sessions): Chromium's GPU process exits immediately there and the
  // app dies with "GPU process isn't usable". Software rendering is fine for
  // development; packaged releases are unaffected. `--no-sandbox` plus
  // `--disable-gpu-sandbox` covers hosts whose restricted sandbox kills the
  // GPU process on startup (exit 1 crash-loop even with `--disable-gpu`);
  // dev-only, packaged releases keep the default sandbox.
  const child = spawn(electronPath, ['.', '--disable-gpu', '--no-sandbox', '--disable-gpu-sandbox'], {
    cwd: APPS_DESKTOP,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code, signal) => process.exit(code ?? 1))
}
