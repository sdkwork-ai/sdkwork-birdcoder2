/**
 * The Desktop profile has exactly one writer Host: a second Host over the same
 * profile directory is refused, and the kernel releases the claim with the
 * holder so a crashed Host never blocks its successor. The two-process case
 * uses a child holding the real lease, because the Electron shell's
 * single-instance lock lives in the browser user-data directory and therefore
 * cannot see a copy started with another one.
 */

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROFILE_IN_USE_MESSAGE,
  PROFILE_LEASE_FILENAME,
  ProfileInUseError,
  acquireProfileLease,
  type ProfileLease,
} from '../src/profile-lease.ts'

const directories: string[] = []
const leases: ProfileLease[] = []

afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.release().catch(() => undefined)
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

/** Claim a lease and register it for teardown; release() stays idempotent. */
async function claim(profileDir: string): Promise<ProfileLease> {
  const lease = await acquireProfileLease(profileDir)
  leases.push(lease)
  return lease
}

async function profileDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-profile-lease-'))
  directories.push(directory)
  return join(directory, 'profiles', 'desktop')
}

describe('Desktop profile lease', () => {
  it('holds the profile until released and then admits the next Host', async () => {
    const profileDir = await profileDirectory()
    const first = await claim(profileDir)
    await expect(acquireProfileLease(profileDir)).rejects.toBeInstanceOf(ProfileInUseError)
    await expect(acquireProfileLease(profileDir)).rejects.toThrow(
      `${PROFILE_IN_USE_MESSAGE}: ${profileDir}`,
    )
    await first.release()
    await claim(profileDir)
  })

  it('keeps the documented prefix the Desktop shell recognizes', () => {
    const error = new ProfileInUseError(join('C:', 'home', 'profiles', 'desktop'))
    expect(error.message.startsWith(`${PROFILE_IN_USE_MESSAGE}: `)).toBe(true)
    // The shell matches this phrase to offer single-instance recovery instead of
    // plugin troubleshooting (apps/desktop/src/fatal-recovery.ts).
    expect(error.message).toMatch(/\bDesktop profile is already in use\b/u)
    expect(error.profileDir).toBe(join('C:', 'home', 'profiles', 'desktop'))
  })

  it('creates the profile directory the Host is about to serve', async () => {
    const profileDir = await profileDirectory()
    await claim(profileDir)
    expect(existsSync(profileDir)).toBe(true)
  })

  it('ignores a lock file left behind by an exited Host', async () => {
    const profileDir = await profileDirectory()
    await mkdir(profileDir, { recursive: true })
    // POSIX lock files survive by design; the kernel lock, not the file,
    // decides ownership. Windows keeps no file and must ignore this either way.
    await writeFile(join(profileDir, PROFILE_LEASE_FILENAME), '')
    await claim(profileDir)
  })

  it('refuses a live holder process and takes over immediately after its crash', { timeout: 30_000 }, async () => {
    const profileDir = await profileDirectory()
    const module = new URL('../src/profile-lease.ts', import.meta.url).href
    const holder = spawn(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', `
      const { acquireProfileLease } = await import(${JSON.stringify(module)})
      await acquireProfileLease(${JSON.stringify(profileDir)})
      process.stdout.write('held\\n')
      setInterval(() => {}, 1000)
    `], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const exited = once(holder, 'exit')
    let stderr = ''
    holder.stderr?.setEncoding('utf8').on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4096) })
    try {
      await once(holder.stdout, 'data')
      await expect(acquireProfileLease(profileDir)).rejects.toBeInstanceOf(ProfileInUseError)
      // No release runs: the kernel drops the lock with the dead process.
      holder.kill('SIGKILL')
      await exited
      const lease = await claim(profileDir)
      await lease.release()
    } catch (error) {
      throw new Error(`${String(error)}\nholder stderr: ${stderr}`)
    } finally {
      if (holder.exitCode === null) holder.kill('SIGKILL')
    }
  })
})
