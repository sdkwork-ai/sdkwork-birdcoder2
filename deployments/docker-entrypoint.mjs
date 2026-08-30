/**
 * Container launcher for the Web profile. Environment variables are converted
 * to argv so authorities containing punctuation never pass through a shell.
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

const args = ['web', '--host', host, '--port', port]
if (host === '0.0.0.0') args.push('--allow-non-loopback')
for (const raw of (process.env.DSH_TRUSTED_HOSTS ?? '').split(',')) {
  const authority = raw.trim()
  if (authority !== '') args.push('--trusted-host', authority)
}
args.push(...process.argv.slice(2))

const child = spawn(process.execPath, ['/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js', ...args], {
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { child.kill(signal) })
}

child.once('error', (error) => {
  console.error(`dsh container: failed to start CLI: ${error.message}`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  if (signal !== null) {
    const signalNumber = { SIGINT: 2, SIGTERM: 15 }[signal] ?? 1
    process.exitCode = 128 + signalNumber
    return
  }
  process.exitCode = code ?? 1
})
