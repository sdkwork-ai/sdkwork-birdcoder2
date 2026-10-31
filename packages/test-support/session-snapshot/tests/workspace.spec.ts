import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  captureExpectedWorkspaceSnapshot,
  captureWorkspaceSnapshot,
  EMPTY_WORKSPACE_MARKER,
} from '../src/workspace.ts'

/** Whether this process may create symlinks at all: Windows requires Developer Mode or an elevated shell. */
async function canSymlink(directory: string): Promise<boolean> {
  const probe = join(directory, '.symlink-probe')
  try {
    await symlink(directory, probe)
    await unlink(probe)
    return true
  } catch {
    return false
  }
}

describe('workspace snapshots', () => {
  const roots: string[] = []

  async function root(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), 'dsh-workspace-snapshot-'))
    roots.push(value)
    return value
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('captures readable text, binary bytes, links, and empty directories in path order', async () => {
    const directory = await root()
    await writeFile(join(directory, 'a.txt'), 'hello\n')
    await writeFile(join(directory, 'b.bin'), Buffer.from([0xff, 0x01]))
    await mkdir(join(directory, 'empty'))
    // FORK DIVERGENCE: a Windows checkout without Developer Mode cannot create a
    // symlink at all (`EPERM`), so the link entry is asserted only where the probe
    // succeeds; the remaining entries still pin the path-order contract.
    const linking = await canSymlink(directory)
    if (linking) await symlink('a.txt', join(directory, 'link'))

    expect(await captureWorkspaceSnapshot(directory)).toEqual([
      { path: 'a.txt', kind: 'text', content: 'hello\n' },
      { path: 'b.bin', kind: 'binary', base64: '/wE=' },
      { path: 'empty', kind: 'empty-directory' },
      ...(linking ? [{ path: 'link', kind: 'symlink', target: 'a.txt' }] : []),
    ])
  })

  it('keeps generic marker files but omits declared runtime roots and the expected-empty marker', async () => {
    const directory = await root()
    await mkdir(join(directory, '.dsh'))
    await writeFile(join(directory, '.dsh', 'runtime.json'), '{}')
    await writeFile(join(directory, EMPTY_WORKSPACE_MARKER), '')
    await writeFile(join(directory, 'visible.txt'), 'visible')

    expect(await captureWorkspaceSnapshot(directory, { ignoredRootEntries: ['.dsh'] })).toEqual([
      { path: '.empty', kind: 'text', content: '' },
      { path: 'visible.txt', kind: 'text', content: 'visible' },
    ])
    expect(await captureExpectedWorkspaceSnapshot(directory)).toEqual([
      { path: '.dsh/runtime.json', kind: 'text', content: '{}' },
      { path: 'visible.txt', kind: 'text', content: 'visible' },
    ])
  })

  it('uses nested expected markers for empty directories without hiding actual workspace files', async () => {
    const directory = await root()
    await mkdir(join(directory, 'locked'))
    await writeFile(join(directory, 'locked', EMPTY_WORKSPACE_MARKER), '')

    expect(await captureExpectedWorkspaceSnapshot(directory)).toEqual([
      { path: 'locked', kind: 'empty-directory' },
    ])
    expect(await captureWorkspaceSnapshot(directory)).toEqual([
      { path: 'locked/.empty', kind: 'text', content: '' },
    ])
  })

  it('treats NUL-bearing UTF-8 as binary workspace state', async () => {
    const directory = await root()
    await writeFile(join(directory, 'nul.bin'), Buffer.from([0x61, 0x00, 0x62]))
    expect(await captureWorkspaceSnapshot(directory)).toEqual([
      { path: 'nul.bin', kind: 'binary', base64: 'YQBi' },
    ])
  })
})
