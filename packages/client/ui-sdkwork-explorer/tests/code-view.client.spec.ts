/**
 * The Monaco viewer's pure surfaces plus the source-tab ledger: language
 * mapping, patch reconstruction, the decorated fallback's stats, and the
 * TabStore's change-view/source-view coexistence for one diff file.
 */

import { describe, expect, it } from 'vitest'
import { monacoLangFromPath, fallbackShikiLang } from '../src/client/monacoLang.ts'
import { canReconstruct, reconstructPatch, ELLIPSIS } from '../src/client/patchReconstruct.ts'
import { diffDecorations } from '../src/client/diffDecorations.ts'
import { formatBytes } from '../src/client/format.ts'
import { normalizeNewTabUrl } from '../src/client/newTabUrl.ts'
import { TabStore } from '../src/client/tabs.ts'

describe('normalizeNewTabUrl', () => {
  it('accepts scheme-less hosts and normalizes whitespace', () => {
    expect(normalizeNewTabUrl(' example.com/docs ')).toBe('https://example.com/docs')
    expect(normalizeNewTabUrl('https://x.dev?a=1')).toBe('https://x.dev/?a=1')
  })

  it('rejects blank, unparseable, and non-http(s) input', () => {
    expect(normalizeNewTabUrl('   ')).toBeUndefined()
    expect(normalizeNewTabUrl('not a url')).toBeUndefined()
    expect(normalizeNewTabUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeNewTabUrl('file:///etc/passwd')).toBeUndefined()
  })
})

describe('monacoLangFromPath', () => {
  it('maps the workspace extensions onto Monaco ids', () => {
    expect(monacoLangFromPath('/w/src/app.ts')).toBe('typescript')
    expect(monacoLangFromPath('/w/scripts/deploy.ps1')).toBe('powershell')
    expect(monacoLangFromPath('/w/api/query.graphql')).toBe('graphql')
    expect(monacoLangFromPath('/w/.github/workflows/ci.yml')).toBe('yaml')
    expect(monacoLangFromPath('/w/changes.patch')).toBe('diff')
  })

  it('resolves extension-less well-known names and falls back to plaintext', () => {
    expect(monacoLangFromPath('/w/Dockerfile')).toBe('dockerfile')
    expect(monacoLangFromPath('/w/Makefile')).toBe('shell')
    expect(monacoLangFromPath('/w/LICENSE')).toBe('plaintext')
    expect(monacoLangFromPath('/w/data.weird')).toBe('plaintext')
  })

  it('narrows the Shiki fallback to the primitives allowlist', () => {
    expect(fallbackShikiLang('shell')).toBe('shellscript')
    expect(fallbackShikiLang('dockerfile')).toBe('dockerfile')
    expect(fallbackShikiLang('protobuf')).toBeUndefined()
  })
})

describe('patchReconstruct', () => {
  const single = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 111..222 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,4 +1,4 @@',
    ' const one = 1',
    '-const two = 2',
    '+const two = "two"',
    ' const three = 3',
    ' const four = 4',
    '\\ No newline at end of file',
  ].join('\n')

  it('recognizes a single-file patch with hunks', () => {
    expect(canReconstruct(single)).toBe(true)
  })

  it('rejects multi-file patches and hunk-less text', () => {
    const multi = `${single}\n${single}`
    expect(canReconstruct(multi)).toBe(false)
    expect(canReconstruct('some random text\nwithout hunks')).toBe(false)
    // Plain (non-git) multi-file patches repeat the +++ headers instead.
    const plainMulti = [
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '--- a/g.txt',
      '+++ b/g.txt',
      '@@ -1,1 +1,1 @@',
      '-c',
      '+d',
    ].join('\n')
    expect(canReconstruct(plainMulti)).toBe(false)
  })

  it('rebuilds both sides with the change counts and the target path', () => {
    const patch = reconstructPatch(single)
    expect(patch.oldText.split('\n')).toEqual(['const one = 1', 'const two = 2', 'const three = 3', 'const four = 4'])
    expect(patch.newText.split('\n')).toEqual(['const one = 1', 'const two = "two"', 'const three = 3', 'const four = 4'])
    expect(patch.targetPath).toBe('src/app.ts')
    expect(patch.added).toBe(1)
    expect(patch.removed).toBe(1)
  })

  it('elides the gap between hunks on both sides', () => {
    const twoHunks = [
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,2 +1,2 @@',
      ' a',
      '-b',
      '+B',
      '@@ -10,2 +10,2 @@',
      ' j',
      '-k',
      '+K',
    ].join('\n')
    const patch = reconstructPatch(twoHunks)
    const oldLines = patch.oldText.split('\n')
    const newLines = patch.newText.split('\n')
    // The gap between hunk one (ends at old line 2) and hunk two (starts at
    // old line 10) is unknown content: one sentinel row on each side.
    expect(oldLines).toEqual(['a', 'b', ELLIPSIS, 'j', 'k'])
    expect(newLines).toEqual(['a', 'B', ELLIPSIS, 'j', 'K'])
    expect(patch.added).toBe(2)
    expect(patch.removed).toBe(2)
  })

  it('classifies hunk-body rows by position, not prefix collisions', () => {
    // Inside the hunk body, `---cache` is the deletion of `--cache` — not a
    // file header — and `++experimental` the addition of `+experimental`.
    const tricky = [
      '--- a/flags.md',
      '+++ b/flags.md',
      '@@ -1,3 +1,4 @@',
      ' # flags',
      '---cache',
      '--verbose',
      '++experimental',
      '+--strict',
    ].join('\n')
    const patch = reconstructPatch(tricky)
    expect(patch.oldText.split('\n')).toEqual(['# flags', '--cache', '-verbose'])
    expect(patch.newText.split('\n')).toEqual(['# flags', '+experimental', '--strict'])
    expect(patch.added).toBe(2)
    expect(patch.removed).toBe(2)
  })

  it('treats a bare empty hunk row as the empty context line and elides the file head', () => {
    const patch = reconstructPatch([
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -2,3 +2,3 @@',
      ' head',
      '',
      '-old',
      '+new',
    ].join('\n'))
    expect(patch.oldText.split('\n')).toEqual([ELLIPSIS, 'head', '', 'old'])
    expect(patch.newText.split('\n')).toEqual([ELLIPSIS, 'head', '', 'new'])
  })

  it('keeps adjacent hunks contiguous without sentinel rows', () => {
    const adjacent = [
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,2 +1,2 @@',
      ' a',
      '-b',
      '+B',
      '@@ -3,2 +3,2 @@',
      ' c',
      '-d',
      '+D',
    ].join('\n')
    const patch = reconstructPatch(adjacent)
    expect(patch.oldText.split('\n')).toEqual(['a', 'b', 'c', 'd'])
    expect(patch.newText.split('\n')).toEqual(['a', 'B', 'c', 'D'])
    expect(patch.oldText).not.toContain(ELLIPSIS)
  })
})

describe('diffDecorations', () => {
  it('classifies rows and counts the changes', () => {
    const stats = diffDecorations([
      'diff --git a/f b/f',
      '--- a/f',
      '+++ b/f',
      '@@ -1,3 +1,3 @@',
      ' ctx',
      '-gone',
      '+new',
      '+newer',
    ].join('\n'))
    expect(stats.added).toBe(2)
    expect(stats.removed).toBe(1)
    const kinds = stats.decorations.map(decoration => decoration.kind)
    expect(kinds).toContain('meta')
    expect(kinds).toContain('hunk')
    expect(kinds).toContain('add')
    expect(kinds).toContain('del')
  })
})

describe('formatBytes', () => {
  it('formats the human sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

describe('TabStore source tabs', () => {
  it('keeps a diff file\'s change view and source view as two tabs', () => {
    const store = new TabStore()
    store.open({ kind: 'file', path: '/w/fix.patch', title: 'fix.patch' })
    store.open({ kind: 'source', path: '/w/fix.patch', title: 'fix.patch · Source' })
    expect(store.getSnapshot().tabs).toHaveLength(2)
    // Re-opening either face activates the existing tab instead of duplicating.
    store.open({ kind: 'file', path: '/w/fix.patch', title: 'fix.patch' })
    expect(store.getSnapshot().tabs).toHaveLength(2)
    expect(store.getSnapshot().activeId).toBe(store.getSnapshot().tabs[0]?.id)
  })
})
