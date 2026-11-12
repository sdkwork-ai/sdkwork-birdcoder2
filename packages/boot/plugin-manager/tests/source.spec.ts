/** The plugin source standard: form validation and the install spec it renders. */

import { describe, expect, it } from 'vitest'
import {
  InvalidPluginSourceError, parsePluginSource, parsePluginSourceSpec, pluginSourceSpec,
  normalizeSourceDirectory,
} from '@deepseek-ai/dsh-plugin-manager/source'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

describe('parsePluginSource', () => {
  it('reads a Git repository, its ref, and the plugin directory inside it', () => {
    expect(parsePluginSource({ kind: 'git', url: 'https://github.com/sdkwork/plugins' })).toEqual({
      kind: 'git', url: 'https://github.com/sdkwork/plugins',
    })
    expect(parsePluginSource({ kind: 'git', url: 'https://github.com/sdkwork/plugins.git', ref: COMMIT, directory: 'plugins/db' })).toEqual({
      kind: 'git', url: 'https://github.com/sdkwork/plugins.git', ref: COMMIT, directory: 'plugins/db',
    })
    // one repository, several plugins: the directory is the identity
    expect(parsePluginSource({ kind: 'git', url: 'sdkwork/plugins', directory: '/plugins/ocr/' })).toEqual({
      kind: 'git', url: 'https://github.com/sdkwork/plugins', directory: 'plugins/ocr',
    })
  })

  it('reads an archive with an optional directory and hash, and a Drive directory', () => {
    expect(parsePluginSource({ kind: 'archive', url: 'https://cdn.example.com/dsh-x.zip', sha256: 'A'.repeat(64), directory: 'package' })).toEqual({
      kind: 'archive', url: 'https://cdn.example.com/dsh-x.zip', sha256: 'a'.repeat(64), directory: 'package',
    })
    expect(parsePluginSource({
      kind: 'drive', url: 'https://drive.example.com/download/abc?signature=xyz', nodeId: 'node_1', directory: 'plugin',
    })).toEqual({
      kind: 'drive', url: 'https://drive.example.com/download/abc?signature=xyz', nodeId: 'node_1', directory: 'plugin',
    })
  })

  it('refuses a form whose parts do not belong together', () => {
    const refusal = (value: unknown): string => {
      try {
        parsePluginSource(value)
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidPluginSourceError)
        return (error as InvalidPluginSourceError).reason
      }
      throw new Error(`${JSON.stringify(value)} was accepted`)
    }
    expect(refusal(null)).toBe('the plugin source must be an object')
    expect(refusal({ kind: 'npm', url: 'https://example.com' })).toBe('the plugin source kind must be git, archive, or drive')
    expect(refusal({ kind: 'git' })).toBe('the plugin source must carry a URL')
    expect(refusal({ kind: 'git', url: 'https://user:secret@github.com/a/b' })).toBe('the Git repository URL must not carry credentials')
    expect(refusal({ kind: 'git', url: 'https://github.com/a/b', sha256: 'a'.repeat(64) })).toBe('a git source carries a ref, not a hash or a Drive node')
    expect(refusal({ kind: 'git', url: 'https://github.com/a/b', ref: 'bad ref' })).toBe('the Git ref has an unusable character')
    expect(refusal({ kind: 'git', url: 'https://github.com/a/b', directory: '../b' })).toBe('the directory inside the source has an unusable segment: ..')
    expect(refusal({ kind: 'archive', url: 'https://cdn.example.com/x.exe' })).toBe('the archive URL must end in .zip, .tar.gz, or .tgz')
    expect(refusal({ kind: 'archive', url: 'https://cdn.example.com/x.zip?token=1', ref: 'main' })).toBe('an archive source carries a hash, not a ref or a Drive node')
    expect(refusal({ kind: 'drive', url: 'https://drive.example.com/a.zip', sha256: 'a'.repeat(64) })).toBe('a drive source carries a Drive node, not a ref or a hash')
    expect(refusal({ kind: 'drive', url: 'https://drive.example.com/a.zip', nodeId: 'bad node' })).toBe('the Drive node id has an unusable character')
  })

  it('normalizes a directory without spelling it differently', () => {
    expect(normalizeSourceDirectory(undefined)).toBeUndefined()
    expect(normalizeSourceDirectory('  ')).toBeUndefined()
    expect(normalizeSourceDirectory('/a/b/')).toBe('a/b')
    expect(() => normalizeSourceDirectory('a\\b')).toThrow(/unusable segment/)
  })
})

describe('the install spec a source renders', () => {
  it('pins Git to the ref and directory pnpm reads', () => {
    expect(pluginSourceSpec({
      kind: 'git', url: 'https://github.com/sdkwork/plugins', ref: COMMIT, directory: 'plugins/db',
    })).toBe(`git+https://github.com/sdkwork/plugins.git#${COMMIT}&path:/plugins/db`)
    // pnpm reads `path:` only after a committish, so a directory without a ref pins HEAD.
    expect(pluginSourceSpec({ kind: 'git', url: 'https://github.com/sdkwork/plugins', directory: 'plugins/db' }))
      .toBe('git+https://github.com/sdkwork/plugins.git#HEAD&path:/plugins/db')
    expect(pluginSourceSpec({ kind: 'git', url: 'https://github.com/sdkwork/plugins.git' }))
      .toBe('git+https://github.com/sdkwork/plugins.git')
  })

  it('marks the archives whose URL alone does not say it is one', () => {
    expect(pluginSourceSpec({ kind: 'archive', url: 'https://cdn.example.com/x.zip', directory: 'package', sha256: 'a'.repeat(64) }))
      .toBe(`https://cdn.example.com/x.zip#path:/package&sha256=${'a'.repeat(64)}`)
    const codeload = `https://codeload.github.com/sdkwork/plugins/tar.gz/${COMMIT}`
    expect(pluginSourceSpec({ kind: 'archive', url: codeload, directory: 'plugins/ocr' }))
      .toBe(`archive+${codeload}#path:/plugins/ocr`)
    expect(pluginSourceSpec({ kind: 'drive', url: 'https://drive.example.com/download/abc?signature=xyz', directory: 'plugin' }))
      .toBe('drive+https://drive.example.com/download/abc?signature=xyz#path:/plugin')
  })

  it('reads every rendered spec back into the same source', () => {
    const sources = [
      { kind: 'git', url: 'https://github.com/sdkwork/plugins.git', ref: COMMIT, directory: 'plugins/db' },
      { kind: 'git', url: 'https://github.com/sdkwork/plugins.git', directory: 'plugins/db' },
      { kind: 'git', url: 'https://github.com/sdkwork/plugins.git' },
      { kind: 'archive', url: 'https://cdn.example.com/x.zip', directory: 'package', sha256: 'a'.repeat(64) },
      { kind: 'archive', url: `https://codeload.github.com/sdkwork/plugins/tar.gz/${COMMIT}`, directory: 'plugins/ocr' },
      { kind: 'drive', url: 'https://drive.example.com/download/abc?signature=xyz', directory: 'plugin' },
    ] as const
    for (const source of sources) {
      expect(parsePluginSourceSpec(pluginSourceSpec(source))).toEqual(source)
    }
    expect(parsePluginSourceSpec('dsh-x@1.0.0')).toBeUndefined()
    expect(parsePluginSourceSpec('/plugins/dsh-x')).toBeUndefined()
    expect(parsePluginSourceSpec('https://cdn.example.com/dsh-x-1.0.0.tgz')).toBeUndefined()
  })
})
