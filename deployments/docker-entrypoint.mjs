/**
 * Container launcher for the Web profile. Environment variables are converted
 * to argv so authorities containing punctuation never pass through a shell.
 *
 * dsh may exit non-zero after printing its URL line (deferred IAM bootstrap,
 * late-plugin teardown, etc.); the entrypoint detects the URL line on stdout,
 * then keeps the Web server listening by respawning dsh as needed until the
 * supervisor sends SIGTERM/SIGINT.
 */

import { spawn } from 'node:child_process'

const truthy = new Set(['1', 'true', 'yes', 'on'])
const host = process.env.DSH_WEB_HOST ?? '0.0.0.0'
const port = process.env.DSH_WEB_PORT ?? '4080'
const allowNonLoopback = truthy.has((process.env.DSH_ALLOW_NON_LOOPBACK ?? '').toLowerCase())

if (host === '0.0.0.0' && !allowNonLoopback) {
  console.error('dsh container: DSH_ALLOW_NON_LOOPBACK must be true when DSH_WEB_HOST is 0.0.0.0')
  process.exit(64)
}
if (host !== '0.0.0.0' && allowNonLoopback) {
  console.error('dsh container: DSH_ALLOW_NON_LOOPBACK is valid only when DSH_WEB_HOST is 0.0.0.0')
  process.exit(64)
}
if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`dsh container: DSH_WEB_PORT must be an integer from 1 to 65535, got ${JSON.stringify(port)}`)
  process.exit(64)
}

// --host 0.0.0.0 is intentionally rejected by the downstream parser; the
// non-loopback binding is governed solely by the DSH_ALLOW_NON_LOOPBACK env
// var (validated above). Pass --host only when the operator requested a
// concrete address, so default-loopback deployments stay unambiguous.
// --no-open suppresses the browser launch; containers have no GUI and a
// failed open attempt exits non-zero, which fails the healthcheck.
const args = ['web', '--no-open']
if (host !== '0.0.0.0') args.push('--host', host)
args.push('--port', port)
for (const raw of (process.env.DSH_TRUSTED_HOSTS ?? '').split(',')) {
  const authority = raw.trim()
  if (authority !== '') args.push('--trusted-host', authority)
}
args.push(...process.argv.slice(2))

let startupConfirmed = false
const startupTimeoutMs = Number(process.env.DSH_STARTUP_TIMEOUT_MS ?? 900_000)
let startupTimer

function clearStartupTimer() {
  if (startupTimer !== undefined) {
    clearTimeout(startupTimer)
    startupTimer = undefined
  }
}

const onChildData = (chunk) => {
  if (!startupConfirmed && /dsh web: /.test(String(chunk))) {
    startupConfirmed = true
    clearStartupTimer()
    console.error('dsh container: Web server startup confirmed; keeping container alive')
  }
}

let respawnCount = 0
const maxRespawns = Number(process.env.DSH_MAX_RESPAWNS ?? 100)
let shuttingDown = false
let currentChild

function spawnDsh() {
  respawnCount += 1
  currentChild = spawn(process.execPath, ['/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js', ...args], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  currentChild.stdout?.on('data', onChildData)
  currentChild.stderr?.on('data', onChildData)

  currentChild.once('error', (error) => {
    console.error(`dsh container: failed to start CLI: ${error.message}`)
    process.exit(1)
  })

  currentChild.once('exit', (code, signal) => {
    clearStartupTimer()
    currentChild = undefined
    if (shuttingDown || signal !== null) {
      const signalNumber = { SIGINT: 2, SIGTERM: 15 }[signal ?? 'SIGTERM'] ?? 15
      process.exitCode = signal != null ? 128 + signalNumber : (code ?? 1)
      return
    }
    if (!startupConfirmed) {
      console.error(`dsh container: CLI failed to start (exit code ${code ?? 'null'})`)
      process.exit(code ?? 1)
      return
    }
    if (respawnCount >= maxRespawns) {
      console.error(`dsh container: reached maximum respawn count (${maxRespawns}); exiting`)
      process.exit(code ?? 1)
      return
    }
    console.error(`dsh container: CLI exited (code=${code ?? 'null'}); respawning (attempt ${respawnCount}/${maxRespawns})`)
    // A brief gap before respawn is acceptable for the healthcheck's start-period.
    setTimeout(spawnDsh, 1000)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true
    currentChild?.kill(signal)
  })
}

// Arm the startup timer before spawning so we crash fast when dsh never prints
// its URL line.
startupTimer = setTimeout(() => {
  if (!startupConfirmed) {
    console.error('dsh container: startup timed out waiting for URL line')
    currentChild?.kill('SIGKILL')
    process.exit(1)
  }
}, startupTimeoutMs)

spawnDsh()
