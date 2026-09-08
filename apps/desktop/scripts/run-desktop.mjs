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
import { readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultCachePath,
  findNativeAddons,
  probeNativeAddons,
  rebuildCommand,
  resolveElectronVersion,
} from './native-abi.mjs'

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

/**
 * Resolve the harness home this launch will use, mirroring the Electron main's
 * per-environment isolation (see src/main.ts): the default tier keeps `~/.dsh`,
 * every other tier gets `~/.dsh-<env>`, and an explicit `$DSH_HOME` always
 * wins. Deliberately local rather than imported from `dsh-home-paths` so the
 * launcher runs before any package is built.
 * @param env - canonical lifecycle environment.
 * @returns absolute harness home path.
 */
function resolveHarnessHome(env) {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return resolve(configured.startsWith('~') ? join(homedir(), configured.slice(1)) : configured)
  }
  return env === 'development' ? join(homedir(), '.dsh') : join(homedir(), `.dsh-${env}`)
}

/**
 * Whether a process id still identifies a live process on this host. Signal 0
 * asks only for existence: `EPERM` means the process exists but is not ours to
 * signal, so a lock it holds still has an owner; `ESRCH` means it is gone.
 * @param pid - process id recorded by a lock holder.
 * @returns `true` while the process is still running.
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/**
 * Delete writer locks whose recorded holder has died. `dsh-atomic-write`
 * creates `<target>.lock` with an exclusive create and removes it in a
 * `finally`, so a launch killed mid-write — Ctrl-C, a stopped dev server, a
 * crash — leaves the lock behind and every later start then fails with
 * "timed out waiting for the writer lock"; the package deliberately leaves
 * orphan recovery to the operator rather than guessing from file age. This
 * launcher is that operator for a dev run: a lock is reclaimed only when the
 * process id it records no longer exists, which can never steal a lock from a
 * live holder. A reused id points at a live process and is left alone, so a
 * false judgment costs one extra wait instead of a concurrent write.
 * @param home - harness home to scan, including subdirectories (the profile
 * module-fallback lock lives under `profiles/`).
 * @returns reclaimed locks as `{ lockPath, pid }`.
 */
async function reclaimOrphanedLocks(home) {
  const reclaimed = []
  const pending = [home]
  while (pending.length > 0) {
    const dir = pending.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // A missing or unreadable directory holds no lock this run can reach.
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.lock')) continue
      let raw
      try {
        raw = await readFile(path, 'utf8')
      } catch {
        continue
      }
      // A writer lock records exactly "<pid>\n"; anything else is not ours.
      const pid = Number.parseInt(raw.trim(), 10)
      if (!Number.isInteger(pid) || pid <= 0) continue
      if (isPidAlive(pid)) continue
      try {
        await rm(path)
        reclaimed.push({ lockPath: path, pid })
      } catch {
        // A concurrent launch reclaimed it first; nothing left to do.
      }
    }
  }
  return reclaimed
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

// Reclaim writer locks orphaned by a killed launch before anything in this
// launch tries to take one. The credentials document and the profile
// module-fallback directory are both mutated under a cross-process lock, and a
// leftover lock turns a healthy checkout into a startup failure that reads
// like a broken install.
for (const { lockPath, pid } of await reclaimOrphanedLocks(resolveHarnessHome(environment))) {
  console.warn(`run-desktop: reclaimed orphaned writer lock ${lockPath} (holder pid ${pid} is no longer running)`)
}

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
  reportNativeAbiMismatches(electronPath)
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

/**
 * Warn, once per install, about native addons Electron cannot load.
 *
 * Addons are compiled during `pnpm install` against the Node.js ABI of the
 * toolchain that built them (127 on Node 22), while the host loads them inside
 * Electron, which carries its own ABI (133 on Electron 35). A mismatch is an
 * unrecoverable ERR_DLOPEN_FAILED, and the Loader reports it only as
 * `failed to import loader entry <name>` inside an AggregateError at the very
 * end of boot — which is how one addon took down `desktop:dev` while every
 * build, typecheck, and unit test stayed green. Naming the addon and the two
 * ABIs before the app starts turns that into a one-line diagnosis.
 *
 * The probe is fingerprint-cached, so this is one notice per install rather
 * than one per launch, and it never raises: which addons the host actually
 * reaches is the host's business (the JSONL session lock takes a Win32 kernel
 * semaphore and never calls `fs-ext` on Windows), so a mismatch is reported,
 * never fatal.
 * @param electronPath - absolute path of the resolved Electron binary.
 */
function reportNativeAbiMismatches(electronPath) {
  try {
    const electronVersion = resolveElectronVersion(APPS_DESKTOP)
    const { mismatched, fresh } = probeNativeAddons(electronPath, findNativeAddons(REPO_ROOT), {
      electronVersion,
      cachePath: defaultCachePath(REPO_ROOT),
    })
    if (fresh || mismatched.length === 0) return
    console.warn(
      `run-desktop: ${mismatched.length} native addon(s) are built for a different ABI than `
        + `Electron ${electronVersion} and will fail if the host loads them:`,
    )
    for (const addon of mismatched) {
      const abi = addon.builtAgainst === undefined
        ? addon.message
        : `built against NODE_MODULE_VERSION ${addon.builtAgainst}, Electron needs ${addon.requiredBy}`
      console.warn(`  ${addon.packageName} (${addon.installKey}) — ${abi}`)
      console.warn(`    cd ${addon.moduleDir} && ${rebuildCommand(addon, electronVersion)}`)
    }
    console.warn('  (only addons the desktop host imports matter; this is a warning, not a stop)')
  } catch (error) {
    // A preflight that cannot run must never be the reason the app will not.
    console.warn(`run-desktop: native ABI preflight skipped — ${error instanceof Error ? error.message : String(error)}`)
  }
}
