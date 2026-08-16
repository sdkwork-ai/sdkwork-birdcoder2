import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bridgeExecPathOptions,
  bridgeHelperProgram,
  EXECPATH_NODE_FLAG,
  installExecPathNodeBridge,
} from '../src/execpath-node-bridge.ts'

const require = createRequire(import.meta.url)

// The bridge patches the shared child_process module; acquire it through
// createRequire after install so the test observes the wrapped entry points.
const childProcess = (): { spawnSync: typeof import('node:child_process')['spawnSync'] } =>
  require('node:child_process') as { spawnSync: typeof import('node:child_process')['spawnSync'] }

const disposers: Array<() => void> = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

describe('bridgeExecPathOptions', () => {
  it('leaves spawns of other programs untouched', () => {
    const options = { cwd: '/tmp', env: { PATH: '/bin' } }
    expect(bridgeExecPathOptions('some-other-program', options)).toBe(options)
    expect(bridgeExecPathOptions('some-other-program', undefined)).toBeUndefined()
  })

  it('adds the flag and inherited env when the caller gave no options', () => {
    const bridged = bridgeExecPathOptions(process.execPath, undefined)
    expect(bridged).toEqual({ env: { ...process.env, [EXECPATH_NODE_FLAG]: '1' } })
  })

  it('merges the flag into caller options without an env', () => {
    const options = { cwd: '/tmp' }
    const bridged = bridgeExecPathOptions(process.execPath, options)
    expect(bridged).not.toBe(options)
    expect(bridged).toEqual({ cwd: '/tmp', env: { ...process.env, [EXECPATH_NODE_FLAG]: '1' } })
  })

  it('merges the flag into a caller env, preserving its other entries', () => {
    const env = { PATH: '/bin', DSH_HOME: '/data' }
    const bridged = bridgeExecPathOptions(process.execPath, { env })
    expect(bridged).toEqual({ env: { PATH: '/bin', DSH_HOME: '/data', [EXECPATH_NODE_FLAG]: '1' } })
  })

  it('keeps a caller-set flag value untouched', () => {
    const options = { env: { [EXECPATH_NODE_FLAG]: '0' } }
    expect(bridgeExecPathOptions(process.execPath, options)).toBe(options)
  })
})

describe('bridgeHelperProgram', () => {
  it('keeps other programs untouched and never calls the resolver', () => {
    let called = false
    expect(bridgeHelperProgram('some-other-program', () => {
      called = true
      return 'C:\\bundled\\node.exe'
    })).toBe('some-other-program')
    expect(called).toBe(false)
  })

  it('rewrites execPath spawns to the bundled node binary', () => {
    expect(bridgeHelperProgram(process.execPath, () => 'C:\\bundled\\node.exe')).toBe('C:\\bundled\\node.exe')
  })

  it('falls back to execPath when no bundled node exists', () => {
    expect(bridgeHelperProgram(process.execPath, () => undefined)).toBe(process.execPath)
  })
})

describe('installExecPathNodeBridge', () => {
  it('runs helpers spawned via process.execPath with the flag set', () => {
    disposers.push(installExecPathNodeBridge())
    const probe = childProcess().spawnSync(
      process.execPath,
      ['-e', `console.log(process.env.${EXECPATH_NODE_FLAG} ?? 'unset')`],
      { encoding: 'utf8' },
    )
    expect(probe.status).toBe(0)
    expect(probe.stdout.trim()).toBe('1')
  })

  it('preserves an explicit caller env and is idempotent', () => {
    disposers.push(installExecPathNodeBridge())
    installExecPathNodeBridge()
    const probe = childProcess().spawnSync(
      process.execPath,
      ['-e', `console.log(process.env.${EXECPATH_NODE_FLAG} ?? 'unset')`],
      { encoding: 'utf8', env: { ...process.env, DSH_MARKER: 'kept' } },
    )
    expect(probe.status).toBe(0)
    expect(probe.stdout.trim()).toBe('1')
  })

  it('restores the original entry points on dispose', () => {
    const dispose = installExecPathNodeBridge()
    dispose()
    const probe = childProcess().spawnSync(
      process.execPath,
      ['-e', `console.log(process.env.${EXECPATH_NODE_FLAG} ?? 'unset')`],
      { encoding: 'utf8' },
    )
    expect(probe.status).toBe(0)
    expect(probe.stdout.trim()).toBe('unset')
  })
})
