#!/usr/bin/env node
/**
 * Thin tablet command wrapper.
 *
 * One entrypoint selects the deployment profile, lifecycle environment, and
 * runtime target, starts or builds the tablet renderer, then invokes the Tauri
 * CLI for the matching native target. Tauri configuration stays declarative in
 * `packages/sdkwork-birdcoder2-pad-tauri/src-tauri/`; this wrapper owns only the
 * process orchestration that the two-target root needs.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const hostRoot = path.join(appRoot, 'packages', 'sdkwork-birdcoder2-pad-tauri')
const stateDir = path.join(appRoot, '.tmp')
const pidFile = path.join(stateDir, 'tablet-dev.json')
const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const tauriBin = process.env.TAURI_CLI || 'tauri'

const ACTIONS = new Set(['dev', 'build'])
const RUNTIME_TARGETS = new Set(['tablet-ipados', 'tablet-android'])
const DEPLOYMENT_PROFILES = new Set(['standalone', 'cloud'])
const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'demo', 'production'])
const DEV_PORT = 1420

function parseArgs(argv) {
  const options = {
    action: 'dev',
    runtimeTarget: 'tablet-ipados',
    deploymentProfile: 'standalone',
    environment: 'development',
    release: false,
    dryRun: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--action') options.action = argv[++index]
    else if (arg === '--runtime-target') options.runtimeTarget = argv[++index]
    else if (arg === '--deployment-profile') options.deploymentProfile = argv[++index]
    else if (arg === '--environment') options.environment = argv[++index]
    else if (arg === '--release') options.release = true
    else if (arg === '--dry-run') options.dryRun = true
    else throw new Error(`unknown tablet option: ${arg}`)
  }
  if (!ACTIONS.has(options.action)) throw new Error(`unsupported tablet action: ${options.action}`)
  if (!RUNTIME_TARGETS.has(options.runtimeTarget)) {
    throw new Error(`unsupported tablet runtime target: ${options.runtimeTarget}`)
  }
  if (!DEPLOYMENT_PROFILES.has(options.deploymentProfile)) {
    throw new Error(`unsupported deployment profile: ${options.deploymentProfile}`)
  }
  if (!ENVIRONMENTS.has(options.environment)) {
    throw new Error(`unsupported lifecycle environment: ${options.environment}`)
  }
  return options
}

function targetConfig(runtimeTarget) {
  return path.join(
    hostRoot,
    'src-tauri',
    runtimeTarget === 'tablet-ipados' ? 'tauri.ios.conf.json' : 'tauri.android.conf.json',
  )
}

function rendererMode(options) {
  const base = `${options.deploymentProfile}.${options.environment}`
  return options.runtimeTarget === 'tablet-android' ? `${base}.tablet-android` : base
}

function platformOf(runtimeTarget) {
  return runtimeTarget === 'tablet-ipados' ? 'ios' : 'android'
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          reject(new Error(`renderer dev server did not listen on 127.0.0.1:${port}`))
        } else {
          setTimeout(attempt, 500)
        }
      })
    }
    attempt()
  })
}

function stopProcess(pid, force = false) {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
  } catch {
    // The process already exited.
  }
}

function writePidFile(value) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(pidFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function removePidFile() {
  try {
    fs.rmSync(pidFile, { force: true })
  } catch {
    // Best effort.
  }
}

async function runDev(options) {
  const mode = rendererMode(options)
  if (!fs.existsSync(viteBin)) {
    throw new Error(`vite executable not found at ${viteBin}; run pnpm install first`)
  }

  const vite = spawn(process.execPath, [viteBin, '--mode', mode], {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env,
  })
  vite.on('error', (error) => {
    console.error('renderer dev server failed to start', error)
    stopProcess(vite.pid, true)
    process.exitCode = 1
  })

  try {
    await waitForPort(DEV_PORT, 60_000)
  } catch (error) {
    stopProcess(vite.pid, true)
    throw error
  }
  if (vite.exitCode !== null) {
    throw new Error(`renderer dev server exited early with code ${vite.exitCode}`)
  }

  const config = targetConfig(options.runtimeTarget)
  const tauri = spawn(tauriBin, [platformOf(options.runtimeTarget), 'dev', '--config', config], {
    cwd: appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      VITE_SDKWORK_RUNTIME_TARGET: options.runtimeTarget,
      VITE_SDKWORK_DEPLOYMENT_PROFILE: options.deploymentProfile,
      VITE_SDKWORK_ENVIRONMENT: options.environment,
      VITE_SDKWORK_PROFILE_ID: `${options.deploymentProfile}.${options.environment}`,
      VITE_SDKWORK_SURFACE: 'pad',
    },
  })
  tauri.on('error', (error) => {
    console.error('Tauri dev process failed to start', error)
    stopProcess(vite.pid, true)
    removePidFile()
    process.exitCode = 1
  })

  writePidFile({
    vitePid: vite.pid,
    tauriPid: tauri.pid,
    mode,
    runtimeTarget: options.runtimeTarget,
    startedAt: new Date().toISOString(),
  })

  const shutdown = () => {
    stopProcess(tauri.pid, true)
    stopProcess(vite.pid, true)
    removePidFile()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  tauri.on('exit', (code) => {
    stopProcess(vite.pid, true)
    removePidFile()
    process.exitCode = code ?? 0
  })
  vite.on('exit', (code) => {
    if (tauri.exitCode === null) {
      stopProcess(tauri.pid, true)
      removePidFile()
      process.exitCode = code ?? 0
    }
  })
}

async function runBuild(options) {
  const mode = rendererMode(options)
  if (options.release) {
    await run(
      process.execPath,
      [
        path.join(appRoot, 'scripts', 'release-preflight.mjs'),
        '--runtime-target',
        options.runtimeTarget,
        '--deployment-profile',
        options.deploymentProfile,
        '--environment',
        options.environment,
      ],
      appRoot,
    )
  }
  await run(process.execPath, [viteBin, 'build', '--mode', mode], appRoot)
  const config = targetConfig(options.runtimeTarget)
  await run(tauriBin, [platformOf(options.runtimeTarget), 'build', '--config', config], appRoot)
}

const options = parseArgs(process.argv.slice(2))
const commands = [
  `${process.execPath} ${viteBin} ${options.action === 'dev' ? '--mode' : 'build --mode'} ${rendererMode(options)}`,
  `${tauriBin} ${platformOf(options.runtimeTarget)} ${options.action} --config ${targetConfig(options.runtimeTarget)}`,
]
if (options.dryRun) {
  for (const command of commands) console.log(command)
  process.exit(0)
}

try {
  if (options.action === 'dev') await runDev(options)
  else await runBuild(options)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}