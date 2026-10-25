/** Platform selection over packed release tarballs. */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptsPlatform, installablePacks, selectPacks } from './platform-packs.ts'

const roots: string[] = []

afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/**
 * Write a raw `package/` directory and tar it the way npm packs a tarball.
 * @param root - scratch directory owning both halves.
 * @param name - fixture name, also the packed directory name.
 * @param manifest - manifest to declare inside `package/package.json`.
 * @returns Absolute path of the tarball the release steps then read.
 */
function packedFixture(root: string, name: string, manifest: Record<string, unknown>): string {
  const source = join(root, 'sources', name, 'package')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'index.js'), 'export {}\n')
  writeFileSync(join(source, 'package.json'), JSON.stringify(manifest))
  const packed = join(root, 'packs')
  mkdirSync(packed, { recursive: true })
  // GNU tar reads an archive argument containing a colon as a remote spec, so
  // the drive-rooted path a release step naturally holds would be rejected:
  // name the archive from inside its own directory, like the release tarball
  // helpers do.
  const archive = spawnSync('tar', ['-czf', `${name}.tgz`, '-C', join(root, 'sources', name), 'package'], {
    cwd: packed, encoding: 'utf8', timeout: 30_000,
  })
  expect(archive.error).toBeUndefined()
  expect(archive.signal).toBeNull()
  expect(archive.status, archive.stderr).toBe(0)
  return join(packed, `${name}.tgz`)
}

describe('acceptsPlatform', () => {
  it('accepts an unconstrained field', () => {
    expect(acceptsPlatform(undefined, 'linux')).toBe(true)
  })

  it('accepts a matching value and rejects a mismatch', () => {
    expect(acceptsPlatform(['linux'], 'linux')).toBe(true)
    expect(acceptsPlatform(['darwin'], 'linux')).toBe(false)
    expect(acceptsPlatform(['linux', 'darwin'], 'win32')).toBe(false)
  })

  it('honours exclusions, which accept everything unnamed', () => {
    expect(acceptsPlatform(['!win32'], 'linux')).toBe(true)
    expect(acceptsPlatform(['!win32'], 'win32')).toBe(false)
    expect(acceptsPlatform(['linux', '!win32'], 'win32')).toBe(false)
  })

  it('accepts the literal any only on its own', () => {
    expect(acceptsPlatform(['any'], 'linux')).toBe(true)
    expect(acceptsPlatform(['any', 'darwin'], 'linux')).toBe(false)
  })

  it('refuses a constraint that is not an array of strings', () => {
    expect(() => acceptsPlatform('linux', 'linux')).toThrow(/arrays of strings/u)
    expect(() => acceptsPlatform(['linux', 3], 'linux')).toThrow(/arrays of strings/u)
  })
})

describe('selectPacks', () => {
  it('marks every packed member for the accepting platform', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(root)
    packedFixture(root, 'shared', { name: '@deepseek-ai/dsh-shared', version: '1.0.0' })
    packedFixture(root, 'macos-only', { name: '@deepseek-ai/dsh-macos-only', version: '1.0.0', os: ['darwin'] })
    packedFixture(root, 'foreign-cpu', {
      name: '@deepseek-ai/dsh-foreign-cpu',
      version: '1.0.0',
      cpu: [process.arch === 'arm64' ? 'x64' : 'arm64'],
    })
    const packs = join(root, 'packs')

    const selected = selectPacks([packs])
    expect(selected.map(candidate => candidate.name)).toEqual([
      '@deepseek-ai/dsh-foreign-cpu',
      '@deepseek-ai/dsh-macos-only',
      '@deepseek-ai/dsh-shared',
    ])
    const compatible = selected.filter(candidate => candidate.compatible).map(candidate => candidate.name)
    expect(compatible).toEqual(['@deepseek-ai/dsh-shared'])
    expect(installablePacks([packs])).toEqual([join(packs, 'shared.tgz')])
  })

  it('accepts a member whose exclusion list omits this platform', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(root)
    packedFixture(root, 'not-windows', { name: '@deepseek-ai/dsh-not-windows', version: '1.0.0', os: [`!${process.platform}`] })
    expect(selectPacks([join(root, 'packs')])[0]?.compatible).toBe(false)
  })

  it('refuses a pack directory holding no tarball', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(root)
    mkdirSync(join(root, 'empty'), { recursive: true })
    expect(() => selectPacks([join(root, 'empty')])).toThrow(/holds no packed tarball/u)
  })

  it('reads several families in the order they are given', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(root)
    packedFixture(root, 'dsh-one', { name: '@deepseek-ai/dsh-one', version: '1.0.0' })
    const vendorRoot = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(vendorRoot)
    packedFixture(vendorRoot, 'vendor-one', { name: '@deepseek-ai/vendor-one', version: '1.0.0' })
    expect(installablePacks([join(root, 'packs'), join(vendorRoot, 'packs')])).toEqual([
      join(root, 'packs', 'dsh-one.tgz'),
      join(vendorRoot, 'packs', 'vendor-one.tgz'),
    ])
  })
})

// A selected path must stay absolute: the image install runs from another directory.
describe('installablePacks', () => {
  it('returns absolute tarball paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-platform-packs-'))
    roots.push(root)
    packedFixture(root, 'shared', { name: '@deepseek-ai/dsh-shared', version: '1.0.0' })
    expect(installablePacks([join(root, 'packs')])[0]).toBe(resolve(join(root, 'packs', 'shared.tgz')))
  })
})
