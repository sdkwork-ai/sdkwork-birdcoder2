/**
 * Ownership of a running source Desktop lane, and replacement of the lane an
 * earlier launch left running.
 *
 * Closing a lane window hides it: Electron, its Host, and the Chromium
 * single-instance lock keep running and the lane's Web port stays bound. A later
 * launch then cannot publish the build it just made (the second Electron exits
 * through the single-instance lock, and the Host port is taken), which reads as
 * "the application does not start" and used to leave a developer quitting the
 * window from the system tray before every relaunch. The launcher therefore
 * records the Electron process it starts, and the next launch of the same lane
 * terminates that process tree before building, so a relaunch always runs the new
 * build.
 *
 * Only processes of this lane are replaced: a process qualifies by carrying this
 * lane's own browser data or its Harness home on its command line, and the
 * installed application, another lane, and unrelated programs never match those
 * paths. When the lane's Web port is held by a process that does not qualify, the
 * launch still refuses instead of terminating it.
 *
 * @module apps/desktop/scripts/development-lane-instance
 */

import { spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { lanePortInUseError, probeLoopbackPort, type DevelopmentLane } from './development-ports.ts'

/** Record naming the Electron process that owns a lane, under the lane's state directory. */
export const LANE_INSTANCE_FILE = 'lane-instance.json'

/** Claim naming the launcher that is preparing a lane, under the lane's state directory. */
export const LANE_LAUNCHER_LOCK_FILE = 'launcher.lock'

/** Milliseconds each termination tier may take before the launch reports failure. */
const LANE_RELEASE_TIMEOUT_MS = 5_000

/** Interval between two checks of a terminating lane. */
const LANE_RELEASE_POLL_MS = 50

/** Electron process a launch started, as persisted for the next launch of the lane. */
export interface LaneInstance {
  /** Generation of the persisted record; a superseded generation is ignored, never migrated. */
  readonly schemaVersion: 1
  /** Lane that started the process. */
  readonly lane: DevelopmentLane
  /** Web port the record's launch used. */
  readonly port: number
  /** Process that must exit before another launch of this lane may start. */
  readonly pid: number
}

/** One operating-system process the lane takeover inspects. */
export interface LaneProcess {
  /** Process id. */
  readonly pid: number
  /** Parent process id, used to find the outermost process of a lane tree. */
  readonly parentPid: number
  /** Full command line as the operating system reports it. */
  readonly command: string
  /** Executable path, or an empty string when the platform reports none. */
  readonly executable: string
}

/** Inputs of {@link claimDevelopmentLane}. */
export interface ClaimDevelopmentLaneOptions {
  /** Lane this launch replaces when it is still running. */
  readonly lane: DevelopmentLane
  /** Web port the lane binds. */
  readonly port: number
  /** Persisted record of the lane's Electron process. */
  readonly instancePath: string
  /** Paths only a process of this lane carries: its browser data and its Harness home. */
  readonly markers: readonly string[]
  /** Port probe, replaced by tests; defaults to {@link probeLoopbackPort}. */
  readonly probe?: (port: number) => Promise<boolean>
  /** Process listing, replaced by tests; defaults to {@link listProcesses}. */
  readonly processes?: () => readonly LaneProcess[]
  /** Signal delivery, replaced by tests; defaults to {@link terminateProcess}. */
  readonly terminate?: (pid: number, force: boolean) => void
  /** Liveness probe, replaced by tests; defaults to the operating system's. */
  readonly alive?: (pid: number) => boolean
  /** Milliseconds one termination tier may take; replaced by tests. */
  readonly timeoutMs?: number
}

/** Outcome of {@link claimDevelopmentLane}. */
export interface ClaimedDevelopmentLane {
  /** Outermost processes of the replaced lane, empty when nothing was running. */
  readonly replaced: readonly number[]
}

/**
 * Record file location of one lane.
 * @param stateRoot - The lane's state directory (`.desktop-build/online` or `.desktop-build/development`).
 * @returns absolute path of the record file.
 */
export function laneInstancePath(stateRoot: string): string {
  return join(stateRoot, LANE_INSTANCE_FILE)
}

/**
 * Paths that identify one lane's processes on their command line.
 *
 * The browser data directory and the Harness home both sit in this lane's state
 * directory, and both appear on the command line of the Electron shell or of the
 * Host it starts. A home another installation owns is never a marker: matching
 * it would terminate the installed application instead of this lane.
 * @param options - The lane's state directory, its browser data, and its resolved Harness home.
 * @returns markers to match against a process command line.
 */
export function laneIdentityMarkers(options: {
  readonly stateRoot: string
  readonly userData: string
  readonly home: string
}): string[] {
  const markers = [options.userData]
  if (insideDirectory(options.stateRoot, options.home)) markers.push(join(options.home, 'profiles'))
  return markers
}

/**
 * Whether one path is strictly below another.
 * @param parent - Directory that may contain the child.
 * @param child - Candidate path.
 * @returns whether the resolved child lies inside the parent on this platform.
 */
function insideDirectory(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

/**
 * Read one lane record.
 * A missing record is the normal first-launch case, and a damaged or
 * superseded one is discarded instead of repaired: the process listing decides
 * what is running, and the record only supplies the process id it named.
 * @param path - Record file to read.
 * @returns the record, or undefined when it is absent or unusable.
 */
export function readLaneInstance(path: string): LaneInstance | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // A missing, unreadable, or malformed record names no process; the caller
    // falls back to the process listing.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const lane = record.lane
  const port = record.port
  const pid = record.pid
  if (record.schemaVersion !== 1) return undefined
  if (lane !== 'development' && lane !== 'online') return undefined
  if (typeof port !== 'number' || !Number.isSafeInteger(port)) return undefined
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid)) return undefined
  return { schemaVersion: 1, lane, port, pid }
}

/**
 * Persist one lane record through a temporary file, so a reader never observes
 * a half-written record.
 * @param path - Record file to replace.
 * @param instance - Process that now owns the lane.
 */
export function writeLaneInstance(path: string, instance: LaneInstance): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(instance)}\n`)
  renameSync(temporary, path)
}

/**
 * Drop the lane record while it still names one process.
 * @param path - Record file to remove.
 * @param pid - Process the caller started; a record naming another process belongs to a later launch and is kept.
 */
export function clearLaneInstance(path: string, pid: number): void {
  if (readLaneInstance(path)?.pid !== pid) return
  rmSync(path, { force: true })
}

/** Claim over the preparation of one lane. */
export interface DevelopmentLauncherLock {
  /** Path of the claim file this handle created. */
  readonly path: string
  /** Drop the claim; repeated calls and a claim another launch took over leave the file alone. */
  release(): void
}

/** Inputs of {@link acquireDevelopmentLauncherLock}. */
export interface AcquireDevelopmentLauncherLockOptions {
  /** Lane whose preparation is claimed. */
  readonly lane: DevelopmentLane
  /** The lane's state directory. */
  readonly stateRoot: string
  /** Liveness probe, replaced by tests; defaults to the operating system's. */
  readonly alive?: (pid: number) => boolean
  /** How long a claim that names no launcher is given to name one; replaced by tests. */
  readonly graceMs?: number
}

/** How long a claim file that exists without a launcher id is given to receive one. */
const LANE_CLAIM_GRACE_MS = 1_000

/**
 * Claim one lane's preparation for this launcher.
 *
 * The disposable project is shared build state: a second launch that prepares it
 * deletes the directories and the runtime descriptor the first one is about to
 * boot, and that first window then fails inside Electron with a missing
 * `desktop-runtime.json`. The claim covers the build and the preparation, is
 * released once the started shell is recorded, and never blocks a later launch
 * from replacing a window that is already running.
 * @param options - Lane identity, state directory, and the probes tests replace.
 * @returns the claim this launch must release.
 * @throws When another live launcher already prepares this lane, or when its claim names no launcher and never will.
 */
export async function acquireDevelopmentLauncherLock(
  options: AcquireDevelopmentLauncherLockOptions,
): Promise<DevelopmentLauncherLock> {
  const path = join(options.stateRoot, LANE_LAUNCHER_LOCK_FILE)
  const alive = options.alive ?? running
  const graceMs = options.graceMs ?? LANE_CLAIM_GRACE_MS
  mkdirSync(dirname(path), { recursive: true })
  // The pid line is written through one descriptor; a claim that another launcher
  // created a moment ago can still be empty when this launcher reads it, so an
  // unnamed claim is retried for the grace period before it counts as stale.
  for (let waited = 0; ;) {
    if (createClaim(path)) return claimHandle(path)
    const owner = readLauncherLock(path)
    if (owner !== undefined) {
      if (alive(owner)) {
        throw new Error(`desktop development: another launch of the ${options.lane} lane is still preparing it `
          + `(pid ${String(owner)}); wait for its window, or stop that launch and start again`)
      }
      // The recorded launcher is gone, so its claim is stale and this launch replaces it.
      rmSync(path, { force: true })
      continue
    }
    if (waited < graceMs) {
      await pause(LANE_RELEASE_POLL_MS)
      waited += LANE_RELEASE_POLL_MS
      continue
    }
    // A claim that never received its launcher id cannot be attributed to a live
    // launch, so it is removed rather than left to block every later launch.
    rmSync(path, { force: true })
    if (createClaim(path)) return claimHandle(path)
    throw new Error(`desktop development: cannot claim ${path}; another process keeps creating it`)
  }
}

/**
 * Create the claim file and write this launcher's process id into it.
 * @param path - Claim file to create.
 * @returns whether this launcher created the claim.
 * @throws When the file cannot be created for a reason other than an existing claim.
 */
function createClaim(path: string): boolean {
  try {
    const descriptor = openSync(path, 'wx', 0o600)
    try {
      writeSync(descriptor, `${String(process.pid)}\n`)
    } finally {
      closeSync(descriptor)
    }
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false
    throw error
  }
}

/**
 * Build the handle that releases one claim.
 * @param path - Claim file this launcher created.
 * @returns the release handle.
 */
function claimHandle(path: string): DevelopmentLauncherLock {
  let held = true
  return {
    path,
    release: () => {
      if (!held) return
      held = false
      // A launcher that found this claim stale may have taken it over already.
      if (readLauncherLock(path) !== process.pid) return
      rmSync(path, { force: true })
    },
  }
}

/**
 * Read the launcher a claim names.
 * @param path - Claim file to read.
 * @returns the recorded process id, or undefined when the file is absent or unusable.
 */
function readLauncherLock(path: string): number | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    // A vanished claim names no owner, which is the state a release leaves behind.
    return undefined
  }
  const owner = Number.parseInt(text.trim(), 10)
  return Number.isSafeInteger(owner) && owner > 0 ? owner : undefined
}

/**
 * Select the processes that belong to one lane.
 * @param entries - Processes the operating system reports.
 * @param markers - Paths only this lane's processes carry.
 * @param caseInsensitive - Whether the platform compares paths without case.
 * @returns matching entries in listing order.
 */
export function selectLaneProcesses(
  entries: readonly LaneProcess[],
  markers: readonly string[],
  caseInsensitive: boolean,
): LaneProcess[] {
  const compared = caseInsensitive ? markers.map(marker => marker.toLowerCase()) : [...markers]
  const matches = (value: string): boolean => {
    if (value === '') return false
    const candidate = caseInsensitive ? value.toLowerCase() : value
    return compared.some(marker => candidate.includes(marker))
  }
  return entries.filter(entry => matches(entry.command) || matches(entry.executable))
}

/**
 * Keep the processes whose parent is not part of the same lane. These are the
 * trees a replacement terminates, and they are what the launch reports.
 * @param entries - Processes selected for one lane.
 * @returns outermost entries in listing order.
 */
export function laneRootProcesses(entries: readonly LaneProcess[]): LaneProcess[] {
  const owned = new Set(entries.map(entry => entry.pid))
  return entries.filter(entry => !owned.has(entry.parentPid))
}

/**
 * Add the descendants of the selected processes. A lane Host is a child of its
 * Electron shell on every platform, and POSIX has no tree-wide signal, so the
 * whole tree has to be addressed explicitly.
 * @param entries - Processes the operating system reports.
 * @param selected - Processes that already belong to the lane.
 * @returns the selected processes plus every process below them.
 */
export function expandLaneDescendants(
  entries: readonly LaneProcess[],
  selected: readonly LaneProcess[],
): LaneProcess[] {
  const owned = new Set(selected.map(entry => entry.pid))
  for (let changed = true; changed;) {
    changed = false
    for (const entry of entries) {
      if (owned.has(entry.pid) || !owned.has(entry.parentPid)) continue
      owned.add(entry.pid)
      changed = true
    }
  }
  return entries.filter(entry => owned.has(entry.pid))
}

/**
 * List every process of the machine with its command line.
 * @returns one entry per process, in the platform's listing order.
 * @throws When the platform cannot list processes, with the command that failed.
 */
export function listProcesses(): LaneProcess[] {
  return process.platform === 'win32' ? windowsProcesses() : posixProcesses()
}

/** Windows enumerates command lines through CIM, the only surface that exposes them. */
function windowsProcesses(): LaneProcess[] {
  const query = [
    '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)',
    '$rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath)',
    'ConvertTo-Json -InputObject $rows -Compress -Depth 3',
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error('desktop development: cannot list running processes; quit the previous lane window '
      + `from the system tray and start again (${result.error?.message ?? `powershell exited ${String(result.status)}`})`)
  }
  let rows: unknown
  try {
    rows = JSON.parse(result.stdout)
  } catch {
    // PowerShell succeeded but printed something this launcher cannot read; the
    // lane cannot be identified from it, and guessing would target other processes.
    throw new Error('desktop development: cannot read the running-process list; quit the previous lane window '
      + 'from the system tray and start again')
  }
  if (!Array.isArray(rows)) return []
  const entries: LaneProcess[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const candidate = row as Record<string, unknown>
    const pid = candidate.ProcessId
    const parentPid = candidate.ParentProcessId
    if (typeof pid !== 'number' || typeof parentPid !== 'number') continue
    entries.push({
      pid,
      parentPid,
      command: typeof candidate.CommandLine === 'string' ? candidate.CommandLine : '',
      executable: typeof candidate.ExecutablePath === 'string' ? candidate.ExecutablePath : '',
    })
  }
  return entries
}

/** POSIX lists the same fields through `ps`; macOS and Linux share the keywords. */
function posixProcesses(): LaneProcess[] {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error('desktop development: cannot list running processes; quit the previous lane window '
      + `and start again (${result.error?.message ?? `ps exited ${String(result.status)}`})`)
  }
  const entries: LaneProcess[] = []
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s(.*)$/u.exec(line)
    if (match === null) continue
    const command = match[3]
    if (command === undefined) continue
    entries.push({ pid: Number(match[1]), parentPid: Number(match[2]), command, executable: '' })
  }
  return entries
}

/**
 * Terminate one process and its children.
 * @param pid - Process to terminate.
 * @param force - Escalate from a termination request to an unconditional kill.
 * @param platform - Platform whose signalling is used; defaults to this process's.
 */
export function terminateProcess(pid: number, force: boolean, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') {
    // taskkill walks the tree, and its unforced form only posts a close request to
    // a GUI window, which this shell answers by hiding again: termination is
    // always forced.
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
  } catch (error) {
    // ESRCH reports the process ending between the liveness check and the signal,
    // which is the outcome this function exists to produce.
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}

/** Whether a process still exists; a permission failure means it exists but is not signalable. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** Pause one polling interval. */
async function pause(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, milliseconds) })
}

/**
 * Take ownership of one lane before its build runs: leave a free lane alone,
 * terminate the lane an earlier launch left running, and refuse a port another
 * program holds.
 * @param options - Lane identity, record location, and the probes tests replace.
 * @returns the outermost processes that were terminated, empty on a free lane.
 * @throws When the lane's Web port belongs to a process this launch does not own, or when the lane's own processes do not exit in time.
 */
export async function claimDevelopmentLane(options: ClaimDevelopmentLaneOptions): Promise<ClaimedDevelopmentLane> {
  const probe = options.probe ?? probeLoopbackPort
  const list = options.processes ?? listProcesses
  const terminate = options.terminate ?? terminateProcess
  const alive = options.alive ?? running
  const timeoutMs = options.timeoutMs ?? LANE_RELEASE_TIMEOUT_MS
  const record = readLaneInstance(options.instancePath)
  const named = record !== undefined && record.lane === options.lane ? record : undefined
  const busy = await probe(options.port)
  // A window whose Host died keeps the single-instance lock and the record, and a
  // launch beside it would find no window to show: the record alone is a reason
  // to replace the lane.
  const recording = named !== undefined && alive(named.pid)
  if (!busy && !recording) {
    if (named !== undefined) clearLaneInstance(options.instancePath, named.pid)
    return { replaced: [] }
  }
  const entries = list()
  const selected = selectLaneProcesses(entries, options.markers, process.platform === 'win32')
  const roots = laneRootProcesses(selected)
  if (roots.length === 0) {
    if (busy) throw lanePortInUseError(options.lane, options.port)
    // The record names a live process this lane does not own: a recycled process
    // id, never a window to replace.
    if (named !== undefined) clearLaneInstance(options.instancePath, named.pid)
    return { replaced: [] }
  }
  const tree = expandLaneDescendants(entries, selected)
  const released = async (): Promise<boolean> => {
    if (await probe(options.port)) return false
    return tree.every(entry => !alive(entry.pid))
  }
  for (const entry of tree) terminate(entry.pid, false)
  for (let waited = 0; waited < timeoutMs; waited += LANE_RELEASE_POLL_MS) {
    if (await released()) return { replaced: roots.map(entry => entry.pid) }
    await pause(LANE_RELEASE_POLL_MS)
  }
  for (const entry of tree) terminate(entry.pid, true)
  for (let waited = 0; waited < timeoutMs; waited += LANE_RELEASE_POLL_MS) {
    if (await released()) return { replaced: roots.map(entry => entry.pid) }
    await pause(LANE_RELEASE_POLL_MS)
  }
  throw new Error(`desktop development: the ${options.lane} lane window (pid ${tree.map(entry => entry.pid).join(', ')}) `
    + 'did not exit; quit it from the system tray and start again')
}
