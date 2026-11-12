/** `apps/README.md` directory-index parsing and row upsert. */
import { describe, expect, it } from 'vitest'
import {
  formatAppsIndexRow,
  parseAppsIndex,
  upsertAppsIndexRow,
} from '../src/client/appsIndex.ts'

const INDEX = `# apps/

Application: sdkwork-demo

## Directory Index

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| pc | pc | yes | PC surface | [README](pc/README.md) |
| shared | common | no | Shared packages | [README](shared/README.md) |

## Allowed Content

- roots
`

describe('parseAppsIndex', () => {
  it('reads the canonical directory table into a name → row map', () => {
    const rows = parseAppsIndex(INDEX)
    expect(rows.get('pc')).toEqual({
      directory: 'pc',
      role: 'pc',
      runnable: 'yes',
      purpose: 'PC surface',
      entry: '[README](pc/README.md)',
    })
    expect(rows.get('shared')?.role).toBe('common')
  })

  it('tolerates a document without the table', () => {
    expect(parseAppsIndex('# apps\n\nNo table here.\n').size).toBe(0)
  })

  it('requires the exact canonical header and separator', () => {
    expect(parseAppsIndex('| Folder | Role |\n| --- | --- |\n| pc | pc |\n').size).toBe(0)
  })
})

describe('upsertAppsIndexRow', () => {
  it('appends a new directory at the end of the table', () => {
    const updated = upsertAppsIndexRow(INDEX, {
      directory: 'h5',
      role: 'h5',
      runnable: 'yes',
      purpose: 'Mobile web',
      entry: '[README](h5/README.md)',
    })
    expect(updated).toContain('| h5 | h5 | yes | Mobile web | [README](h5/README.md) |')
    expect(updated.indexOf('| h5 |')).toBeLessThan(updated.indexOf('## Allowed Content'))
  })

  it('replaces an existing row in place and preserves other sections', () => {
    const updated = upsertAppsIndexRow(INDEX, {
      directory: 'pc',
      role: 'pc',
      runnable: 'no',
      purpose: 'Retired PC surface',
      entry: 'pc/',
    })
    expect(updated).toContain('| pc | pc | no | Retired PC surface | pc/ |')
    expect(updated).not.toContain('[README](pc/README.md)')
    expect(updated).toContain('| shared | common | no | Shared packages | [README](shared/README.md) |')
  })

  it('returns the input unchanged without a table', () => {
    expect(upsertAppsIndexRow('# apps\n', {
      directory: 'pc',
      role: 'pc',
      runnable: 'yes',
      purpose: '',
      entry: 'pc/',
    })).toBe('# apps\n')
  })

  it('escapes a pipe in a cell and keeps the document line ending', () => {
    const updated = upsertAppsIndexRow(INDEX.replaceAll('\n', '\r\n'), {
      directory: 'pipe',
      role: 'app',
      runnable: 'yes',
      purpose: 'a | b',
      entry: 'pipe/',
    })
    expect(updated).toContain('| pipe | app | yes | a \\| b | pipe/ |\r\n')
  })

  it('formats one row with a caller-provided line ending', () => {
    expect(formatAppsIndexRow({ directory: 'a', role: 'app', runnable: 'yes', purpose: 'x', entry: 'a/' }, '\n'))
      .toBe('| a | app | yes | x | a/ |\n')
  })
})
