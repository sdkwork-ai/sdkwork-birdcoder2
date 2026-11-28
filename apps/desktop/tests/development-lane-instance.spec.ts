import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireDevelopmentLauncherLock,
  claimDevelopmentLane,
  clearLaneInstance,
  expandLaneDescendants,
  laneIdentityMarkers,
  laneInstancePath,
  laneRootProcesses,
  readLaneInstance,
  selectLaneProcesses,
  writeLaneInstance,
  type LaneProcess,
} from '../scripts/development-lane-instance.ts'

// Paths are built with `join` so the markers carry the separator of the platform
// running the tests: the launcher compares them against real command lines.
const LANE_ROOT = join('checkout', 'apps', 'desktop', '.desktop-build', 'online')
const USER_DATA = join(LANE_ROOT, 'electron-user-data')
const LANE_HOME = join(LANE_ROOT, 'home')
const MARKERS = [USER_DATA, join(LANE_HOME, 'profiles')]
const INSTALLED_HOME = resolve('installed-home', '.birdcoder')

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-lane-instance-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** Processes of one lane: the Electron shell, its Host, and one renderer. */
function laneTree(shellPid = 101, hostPid = 102, rendererPid = 103): LaneProcess[] {
  return [
    { pid: shellPid, parentPid: 90, command: `electron --user-data-dir=${USER_DATA} ${LANE_ROOT}`, executable: '' },
    { pid: hostPid, parentPid: shellPid, command: `electron host.js ${join(LANE_HOME, 'profiles')}`, executable: '' },
    { pid: rendererPid, parentPid: shellPid, command: `electron --type=renderer --user-data-dir=${USER_DATA}`, executable: '' },
  ]
}

describe('lane instance record', () => {
  it('round-trips the process a launch started', () => {
    const path = laneInstancePath(join(temporaryDirectory(), 'online'))
    writeLaneInstance(path, { schemaVersion: 1, lane: 'online', port: 19389, pid: 4242 })
    expect(readLaneInstance(path)).toEqual({ schemaVersion: 1, lane: 'online', port: 19389, pid: 4242 })
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true)
  })

  it('reports no process for a missing, damaged, or superseded record', () => {
    const directory = temporaryDirectory()
    expect(readLaneInstance(join(directory, 'absent.json'))).toBeUndefined()
    const damaged = join(directory, 'damaged.json')
    writeFileSync(damaged, '{not json')
    expect(readLaneInstance(damaged)).toBeUndefined()
    const superseded = join(directory, 'superseded.json')
    writeFileSync(superseded, JSON.stringify({ schemaVersion: 2, lane: 'online', port: 19389, pid: 1 }))
    expect(readLaneInstance(superseded)).toBeUndefined()
    const foreignLane = join(directory, 'foreign.json')
    writeFileSync(foreignLane, JSON.stringify({ schemaVersion: 1, lane: 'staging', port: 19389, pid: 1 }))
    expect(readLaneInstance(foreignLane)).toBeUndefined()
  })

  it('removes only the record naming the process that exited', () => {
    const path = laneInstancePath(temporaryDirectory())
    writeLaneInstance(path, { schemaVersion: 1, lane: 'online', port: 19389, pid: 4242 })
    clearLaneInstance(path, 5252)
    expect(existsSync(path)).toBe(true)
    clearLaneInstance(path, 4242)
    expect(existsSync(path)).toBe(false)
  })
})

describe('laneIdentityMarkers', () => {
  it('names the browser data and the Harness home of a lane-owned home', () => {
    expect(laneIdentityMarkers({ stateRoot: LANE_ROOT, userData: USER_DATA, home: LANE_HOME }))
      .toEqual([USER_DATA, join(LANE_HOME, 'profiles')])
  })

  it('never names a home an installation owns', () => {
    // An installed home would match the installed application's Host; the browser
    // data of this lane is its only safe marker.
    expect(laneIdentityMarkers({ stateRoot: LANE_ROOT, userData: USER_DATA, home: INSTALLED_HOME }))
      .toEqual([USER_DATA])
  })
})

describe('selectLaneProcesses', () => {
  it('selects the shell by its browser data and the Host by its lane home', () => {
    const entries = [...laneTree(), { pid: 200, parentPid: 1, command: 'node unrelated.js', executable: '/usr/bin/node' }]
    expect(selectLaneProcesses(entries, MARKERS, false).map(entry => entry.pid)).toEqual([101, 102, 103])
  })

  it('matches the executable path of a bundled shell', () => {
    const entries = [{
      pid: 301,
      parentPid: 1,
      command: '',
      executable: join(LANE_ROOT, 'Harness Dev.app', 'Contents', 'MacOS', 'HarnessDev'),
    }]
    expect(selectLaneProcesses(entries, [LANE_ROOT], false).map(entry => entry.pid)).toEqual([301])
  })

  it('never selects the other lane through the npm project both lanes share', () => {
    // The online lane's Host runs from the development lane's disposable project,
    // so the development lane root appears on its command line without belonging
    // to the development lane.
    const entries = laneTree()
    const developmentMarkers = [join('checkout', 'apps', 'desktop', '.desktop-build', 'development', 'electron-user-data')]
    expect(selectLaneProcesses(entries, developmentMarkers, false)).toEqual([])
  })

  it('compares paths without case only where the platform does', () => {
    const entries = [{
      pid: 401,
      parentPid: 1,
      command: `electron --user-data-dir=${USER_DATA.toUpperCase()}`,
      executable: '',
    }]
    expect(selectLaneProcesses(entries, MARKERS, true).map(entry => entry.pid)).toEqual([401])
    expect(selectLaneProcesses(entries, MARKERS, false)).toEqual([])
  })
})

describe('lane tree boundaries', () => {
  it('keeps the outermost process of each lane tree', () => {
    const entries = [...laneTree(), { pid: 500, parentPid: 1, command: `other --user-data-dir=${USER_DATA}`, executable: '' }]
    expect(laneRootProcesses(entries).map(entry => entry.pid)).toEqual([101, 500])
  })

  it('adds descendants that do not carry a marker themselves', () => {
    const entries = [
      ...laneTree(101, 102, 103),
      { pid: 104, parentPid: 102, command: 'node plugin-worker.js', executable: '' },
      { pid: 900, parentPid: 1, command: 'node unrelated.js', executable: '' },
    ]
    const selected = selectLaneProcesses(entries, [USER_DATA], false)
    expect(expandLaneDescendants(entries, selected).map(entry => entry.pid)).toEqual([101, 102, 103, 104])
  })
})

describe('claimDevelopmentLane', () => {
  it('leaves a free lane alone and drops a record whose process is gone', async () => {
    const path = laneInstancePath(temporaryDirectory())
    writeLaneInstance(path, { schemaVersion: 1, lane: 'online', port: 19389, pid: 4242 })
    const terminated: number[] = []
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: path,
      markers: MARKERS,
      probe: async () => false,
      processes: () => [],
      terminate: (pid) => { terminated.push(pid) },
      alive: () => false,
    })).resolves.toEqual({ replaced: [] })
    expect(terminated).toEqual([])
    expect(existsSync(path)).toBe(false)
  })

  it('replaces the lane an earlier launch left running', async () => {
    const entries = laneTree()
    const alive = new Set([101, 102, 103])
    const terminated: number[] = []
    const claim = claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: laneInstancePath(temporaryDirectory()),
      markers: MARKERS,
      probe: async () => alive.size > 0,
      processes: () => entries,
      terminate: (pid) => {
        terminated.push(pid)
        alive.delete(pid)
      },
      alive: pid => alive.has(pid),
      timeoutMs: 40,
    })
    await expect(claim).resolves.toEqual({ replaced: [101] })
    expect(terminated).toEqual([101, 102, 103])
  })

  it('replaces a shell whose Host already exited', async () => {
    // The port is free because the Host died, but the shell keeps the Electron
    // single-instance lock: a launch beside it would show no window at all.
    const path = laneInstancePath(temporaryDirectory())
    writeLaneInstance(path, { schemaVersion: 1, lane: 'online', port: 19389, pid: 101 })
    const entries = [{ pid: 101, parentPid: 90, command: `electron --user-data-dir=${USER_DATA}`, executable: '' }]
    const alive = new Set([101])
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: path,
      markers: MARKERS,
      probe: async () => false,
      processes: () => entries,
      terminate: (pid) => { alive.delete(pid) },
      alive: pid => alive.has(pid),
      timeoutMs: 40,
    })).resolves.toEqual({ replaced: [101] })
  })

  it('refuses a port another program holds and terminates nothing', async () => {
    const terminated: number[] = []
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: laneInstancePath(temporaryDirectory()),
      markers: MARKERS,
      probe: async () => true,
      processes: () => [{ pid: 700, parentPid: 1, command: 'other-service', executable: '' }],
      terminate: (pid) => { terminated.push(pid) },
      alive: () => true,
      timeoutMs: 40,
    })).rejects.toThrow(/online lane web port 19389 is already in use by a process this launch does not own/u)
    expect(terminated).toEqual([])
  })

  it('reports a lane window that does not exit, after escalating to a forced termination', async () => {
    const entries = laneTree()
    const forced: boolean[] = []
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: laneInstancePath(temporaryDirectory()),
      markers: MARKERS,
      probe: async () => true,
      processes: () => entries,
      terminate: (_pid, force) => { forced.push(force) },
      alive: () => true,
      timeoutMs: 20,
    })).rejects.toThrow(/online lane window \(pid 101, 102, 103\) did not exit; quit it from the system tray/u)
    expect(forced).toContain(false)
    expect(forced).toContain(true)
  })

  it('ignores a record whose process id was recycled by a program outside the lane', async () => {
    const path = laneInstancePath(temporaryDirectory())
    writeLaneInstance(path, { schemaVersion: 1, lane: 'online', port: 19389, pid: 4242 })
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: path,
      markers: MARKERS,
      probe: async () => false,
      processes: () => [{ pid: 4242, parentPid: 1, command: 'unrelated', executable: '' }],
      terminate: () => {},
      alive: () => true,
      timeoutMs: 40,
    })).resolves.toEqual({ replaced: [] })
    expect(existsSync(path)).toBe(false)
  })

  it('ignores a record of the other lane', async () => {
    const path = laneInstancePath(temporaryDirectory())
    writeLaneInstance(path, { schemaVersion: 1, lane: 'development', port: 19388, pid: 4242 })
    await expect(claimDevelopmentLane({
      lane: 'online',
      port: 19389,
      instancePath: path,
      markers: MARKERS,
      probe: async () => false,
      processes: () => [],
      terminate: () => {},
      alive: () => true,
      timeoutMs: 40,
    })).resolves.toEqual({ replaced: [] })
  })
})

describe('acquireDevelopmentLauncherLock', () => {
  it('claims the lane preparation and releases it', async () => {
    const stateRoot = temporaryDirectory()
    const lock = await acquireDevelopmentLauncherLock({ lane: 'online', stateRoot })
    expect(lock.path).toBe(join(stateRoot, 'launcher.lock'))
    expect(readFileSync(lock.path, 'utf8')).toBe(`${String(process.pid)}\n`)
    lock.release()
    expect(existsSync(lock.path)).toBe(false)
    lock.release()
    expect(existsSync(lock.path)).toBe(false)
  })

  it('refuses a lane another live launcher is preparing', async () => {
    const stateRoot = temporaryDirectory()
    writeFileSync(join(stateRoot, 'launcher.lock'), '5150\n')
    await expect(acquireDevelopmentLauncherLock({ lane: 'online', stateRoot, alive: () => true }))
      .rejects.toThrow(/another launch of the online lane is still preparing it \(pid 5150\)/u)
    // The other launcher keeps its claim.
    expect(readFileSync(join(stateRoot, 'launcher.lock'), 'utf8')).toBe('5150\n')
  })

  it('takes a stale claim over', async () => {
    const stateRoot = temporaryDirectory()
    writeFileSync(join(stateRoot, 'launcher.lock'), '5150\n')
    const lock = await acquireDevelopmentLauncherLock({ lane: 'development', stateRoot, alive: () => false })
    expect(readFileSync(lock.path, 'utf8')).toBe(`${String(process.pid)}\n`)
    lock.release()
    expect(existsSync(lock.path)).toBe(false)
  })

  it('takes a claim over once it never learned a launcher id', async () => {
    // A claim created by a launcher that died between creating and writing it.
    const stateRoot = temporaryDirectory()
    writeFileSync(join(stateRoot, 'launcher.lock'), '')
    const lock = await acquireDevelopmentLauncherLock({ lane: 'online', stateRoot, graceMs: 65 })
    expect(readFileSync(lock.path, 'utf8')).toBe(`${String(process.pid)}\n`)
    lock.release()
    expect(existsSync(lock.path)).toBe(false)
  })

  it('keeps a claim another launcher took over', async () => {
    const stateRoot = temporaryDirectory()
    const lock = await acquireDevelopmentLauncherLock({ lane: 'online', stateRoot })
    // The claim read as stale by a later launch: it replaces the file and owns it.
    writeFileSync(lock.path, '5252\n')
    lock.release()
    expect(readFileSync(lock.path, 'utf8')).toBe('5252\n')
  })
})
