import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_KEY, escapeHtmlText, replaceDocumentTitle, resolveBuildTitle, retitleManifest } from '../scripts/build-brand.ts'

/** One temporary manifest directory a case can extend. */
function brandDir(manifests: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-web-brand-'))
  for (const [key, manifest] of Object.entries(manifests)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(manifest), 'utf8')
  }
  return dir
}

describe('resolveBuildTitle', () => {
  it('ships the selected brand manifest display name', () => {
    const dir = brandDir({ [DEFAULT_BRAND_KEY]: { displayName: 'BirdCoder' } })
    expect(resolveBuildTitle({}, dir)).toBe('BirdCoder')
    const acme = brandDir({ 'acme-coder': { displayName: 'Acme Coder' } })
    expect(resolveBuildTitle({ DSH_BRAND: 'acme-coder' }, acme)).toBe('Acme Coder')
  })

  it('lets an explicit title override win over the manifest', () => {
    const dir = brandDir({ [DEFAULT_BRAND_KEY]: { displayName: 'BirdCoder' } })
    expect(resolveBuildTitle({ DSH_BRAND: 'birdcoder', DSH_CLIENT_TITLE: 'Local' }, dir)).toBe('Local')
    // A blank override is no override.
    expect(resolveBuildTitle({ DSH_CLIENT_TITLE: '   ' }, dir)).toBe('BirdCoder')
  })

  it('escapes the name before it reaches the title element', () => {
    expect(escapeHtmlText('A & B <C>')).toBe('A &amp; B &lt;C&gt;')
    expect(resolveBuildTitle({ DSH_CLIENT_TITLE: 'A & B' }, brandDir())).toBe('A &amp; B')
  })

  it('keeps the checked-in document when a build carries no manifests', () => {
    expect(resolveBuildTitle({}, brandDir())).toBeUndefined()
  })

  it('fails loud when an explicit selection cannot be honoured', () => {
    const dir = brandDir({ [DEFAULT_BRAND_KEY]: { displayName: 'BirdCoder' } })
    expect(() => resolveBuildTitle({ DSH_BRAND: 'missing' }, dir))
      .toThrow(/DSH_BRAND selects "missing"/)
    expect(() => resolveBuildTitle({ DSH_BRAND: 'Not A Key' }, dir))
      .toThrow(/is not a brand key/)
  })

  it('rejects an unusable display name', () => {
    for (const manifest of [{}, { displayName: '  ' }, { displayName: 7 }, { displayName: 'bad\u0000name' }, { displayName: 'x'.repeat(65) }]) {
      const dir = brandDir({ [DEFAULT_BRAND_KEY]: manifest })
      expect(() => resolveBuildTitle({}, dir)).toThrow(/needs a displayName/)
    }
  })
})

describe('replaceDocumentTitle', () => {
  it('rewrites the checked-in title element whatever it spells', () => {
    const shipped = '<head><meta charset="utf-8" /><title>BirdCoder</title></head>'
    expect(replaceDocumentTitle(shipped, 'Acme Coder')).toBe('<head><meta charset="utf-8" /><title>Acme Coder</title></head>')
    // The upstream shell title the old literal target named is replaced too.
    expect(replaceDocumentTitle('<title>DSH Local Build</title>', 'Acme'))
      .toBe('<title>Acme</title>')
  })
})

describe('retitleManifest', () => {
  it('renames the install metadata and keeps every other field', () => {
    const manifest = retitleManifest(JSON.stringify({
      name: 'BirdCoder',
      short_name: 'BirdCoder',
      start_url: './',
      icons: [{ src: './favicon.png' }],
    }), 'Acme Coder')
    expect(JSON.parse(manifest)).toEqual({
      name: 'Acme Coder',
      short_name: 'Acme Coder',
      start_url: './',
      icons: [{ src: './favicon.png' }],
    })
  })
})
