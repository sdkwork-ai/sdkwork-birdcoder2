#!/usr/bin/env node
/**
 * Stops only the process tree started by this root's own tablet development
 * session. It never operates on deployed services or other checkouts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pidFile = path.join(appRoot, '.tmp', 'tablet-dev.json')

function kill(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // The process already exited.
  }
}

if (!fs.existsSync(pidFile)) {
  console.log('no tablet development session is recorded for this root')
  process.exit(0)
}

let session
try {
  session = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
} catch (error) {
  console.error(`cannot read ${pidFile}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

kill(session.tauriPid)
kill(session.vitePid)
fs.rmSync(pidFile, { force: true })
console.log(`stopped tablet development session (${session.runtimeTarget}, ${session.mode})`)