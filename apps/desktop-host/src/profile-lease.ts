/**
 * Exclusive, process-lifetime ownership of one Desktop profile directory.
 *
 * A Desktop profile has exactly one writer Host. Electron's own single-instance
 * lock lives in the browser user-data directory, so it cannot see a second copy
 * started with another user-data directory — a development build pointed at the
 * installed Harness home is the ordinary way that happens. Two Hosts over one
 * profile race on sessions and the assistant's operational database, so the Host
 * that actually owns the profile data claims this lease before it loads anything.
 *
 * The arbiter is the kernel on both platforms: POSIX takes a non-blocking
 * `flock(2)` on `<profile>/.host.lock` through the native system addon, and
 * Windows holds a named kernel semaphore derived from the same path, so no lock
 * file exists there. Contention maps to {@link ProfileInUseError}. The kernel
 * releases the lock with the holder's descriptors or last handle, including on
 * any process death, so a crashed Host never blocks its successor and there is
 * deliberately no expiry that could expropriate a live Host.
 *
 * @module @deepseek-ai/dsh-desktop-host/profile-lease
 */

import { createHash } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Base name of the POSIX lock file inside a profile directory. */
export const PROFILE_LEASE_FILENAME = '.host.lock'

/**
 * Message prefix for a refusal. The Desktop shell recognizes this phrase to
 * offer single-instance recovery instead of plugin troubleshooting; keep
 * `apps/desktop/src/fatal-recovery.ts` in sync when it changes.
 */
export const PROFILE_IN_USE_MESSAGE = 'Desktop profile is already in use'

/** A live Host already owns the profile this process was asked to serve. */
export class ProfileInUseError extends Error {
  /**
   * @param profileDir - Absolute profile directory whose lease is held.
   */
  constructor(readonly profileDir: string) {
    super(`${PROFILE_IN_USE_MESSAGE}: ${profileDir}`)
    this.name = 'ProfileInUseError'
  }
}

/** One held profile lease; releasing it admits the next Host. */
export interface ProfileLease {
  /** Release the kernel lock. Safe to call more than once; the process exit releases it too. */
  release(): Promise<void>
}

/** Wrap a platform release so shutdown may run it twice without closing twice. */
function onceLease(close: () => Promise<void> | void): ProfileLease {
  let released: Promise<void> | undefined
  return {
    release: () => released ??= Promise.resolve().then(async () => { await close() }),
  }
}

/**
 * Claim the Desktop profile directory for this process.
 * @param profileDir - Profile directory the Host is about to load.
 * @returns The held lease, released on shutdown.
 * @throws {ProfileInUseError} while another Host owns the profile.
 */
export async function acquireProfileLease(profileDir: string): Promise<ProfileLease> {
  const directory = resolve(profileDir)
  // The Host would create the profile on its first write; the lease needs it now.
  await mkdir(directory, { recursive: true })
  const lockPath = join(directory, PROFILE_LEASE_FILENAME)
  return process.platform === 'win32'
    ? acquireWindowsLease(lockPath, directory)
    : acquirePosixLease(lockPath, directory)
}

/** Whether a flock failure means another descriptor holds the lock. */
function isLockContention(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  // flock(2) reports EAGAIN; some libcs spell it EWOULDBLOCK.
  return code === 'EAGAIN' || code === 'EWOULDBLOCK'
}

async function acquirePosixLease(lockPath: string, profileDir: string): Promise<ProfileLease> {
  const { tryLockExclusive } = await import('@deepseek-ai/node-addon-system/flock')
  // Never unlink the lock file: a POSIX lock names an inode, so a recreated
  // file would let the next Host lock an inode no other Host consults.
  const handle = await open(lockPath, 'w')
  try {
    await tryLockExclusive(handle.fd)
  } catch (error) {
    await handle.close()
    if (isLockContention(error)) throw new ProfileInUseError(profileDir)
    throw error
  }
  return onceLease(() => releasePosixLease(handle))
}

function releasePosixLease(handle: FileHandle): Promise<void> {
  // Closing the descriptor releases the kernel lock once every descriptor for
  // its open file description is closed.
  return handle.close()
}

/** Win32 `CreateSemaphoreW` returns an inaccessible handle on failure. */
const INVALID_HANDLE = 0
const WAIT_OBJECT_0 = 0
const WAIT_TIMEOUT = 0x00000102

type CreateSemaphoreW = (security: null, initial: number, maximum: number, name: string) => number
type WaitForSingleObject = (handle: number, milliseconds: number) => number
type CloseHandle = (handle: number) => number

interface Win32Bindings {
  createSemaphoreW: CreateSemaphoreW
  waitForSingleObject: WaitForSingleObject
  closeHandle: CloseHandle
}

/** Load only the three kernel calls this lease needs. */
async function win32(): Promise<Win32Bindings> {
  const { default: koffi } = await import('koffi')
  const kernel32 = koffi.load('kernel32.dll')
  return {
    createSemaphoreW: kernel32.func('__stdcall', 'CreateSemaphoreW', 'intptr', ['void*', 'int', 'int', 'str16']) as CreateSemaphoreW,
    waitForSingleObject: kernel32.func('__stdcall', 'WaitForSingleObject', 'uint', ['intptr', 'uint']) as WaitForSingleObject,
    closeHandle: kernel32.func('__stdcall', 'CloseHandle', 'int', ['intptr']) as CloseHandle,
  }
}

/**
 * Name of the per-profile kernel semaphore. `Local\` scopes it to the logon
 * session, matching the single-user scope of a Harness home, and the hash
 * keeps long profile paths inside the Win32 object-name budget.
 */
function semaphoreName(lockPath: string): string {
  const digest = createHash('sha256').update(resolve(lockPath).toLowerCase()).digest('hex')
  return `Local\\birdcoder-desktop-profile-${digest}`
}

async function acquireWindowsLease(lockPath: string, profileDir: string): Promise<ProfileLease> {
  const kernel = await win32()
  const name = semaphoreName(lockPath)
  const handle = kernel.createSemaphoreW(null, 1, 1, name)
  if (handle === INVALID_HANDLE) throw new Error(`profile lease: CreateSemaphoreW failed for ${lockPath}`)
  const wait = kernel.waitForSingleObject(handle, 0)
  if (wait === WAIT_OBJECT_0) {
    return onceLease(() => { kernel.closeHandle(handle) })
  }
  kernel.closeHandle(handle)
  if (wait === WAIT_TIMEOUT) throw new ProfileInUseError(profileDir)
  throw new Error(`profile lease: WaitForSingleObject failed for ${lockPath}`)
}
