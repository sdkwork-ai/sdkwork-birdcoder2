/**
 * Skill portability: a product skill may only point inside its own package and
 * must ship a manifest when it carries assets; a repository skill may cite its
 * checkout but dead links are still reported.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectSkillPortabilityViolations } from './verify-skill-portability.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Write one fixture file, creating parents. */
function write(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

/** One repository fixture with the product and repository skill roots. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-portability-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) write(root, path, content)
  return root
}

/** A product skill directory. */
const PRODUCT = 'packages/skill/sdkwork-builtin-skills/assets/skills'
/** A repository skill directory. */
const REPO = '.agents/skills'

/** One product skill manifest over its packaged files. */
function manifest(files: readonly string[]): string {
  return JSON.stringify({ name: 'fixture', version: '0.1.0', scope: 'product', files: files.map(path => ({ path })) })
}

describe('skill portability', () => {
  it('accepts a self-contained product skill with a manifest', () => {
    const root = fixture({
      [`${PRODUCT}/demo/SKILL.md`]: 'Read [a](references/a.md).\n\nAuthority: `sdkwork-specs/APP_MANIFEST_SPEC.md` (optional when a checkout exists).\n',
      [`${PRODUCT}/demo/references/a.md`]: '# a\n',
      [`${PRODUCT}/demo/skill.manifest.json`]: manifest(['references/a.md']),
    })
    expect(collectSkillPortabilityViolations(root)).toEqual([])
  })

  it('rejects parent paths, absolute paths and operational spec paths', () => {
    const root = fixture({
      [`${PRODUCT}/demo/SKILL.md`]: 'See [parent](../other.md), [abs](C:/work/x.md), [spec](sdkwork-specs/APP_MANIFEST_SPEC.md).\n',
    })
    const findings = collectSkillPortabilityViolations(root)
    expect(findings.map(item => item.rule)).toEqual(expect.arrayContaining(['parent-path', 'absolute-path', 'external-spec-path']))
    expect(findings.every(item => item.severity === 'error')).toBe(true)
  })

  it('requires a manifest for a product skill that carries assets', () => {
    const root = fixture({
      [`${PRODUCT}/demo/SKILL.md`]: 'Read [a](references/a.md).\n',
      [`${PRODUCT}/demo/references/a.md`]: '# a\n',
    })
    expect(collectSkillPortabilityViolations(root)).toContainEqual(expect.objectContaining({
      skill: 'demo', rule: 'manifest-missing', severity: 'error',
    }))
  })

  it('accepts a directory link covered by the packaged files', () => {
    const root = fixture({
      [`${PRODUCT}/demo/SKILL.md`]: 'Read [standards](references/standards/).\n',
      [`${PRODUCT}/demo/references/standards/APP_MANIFEST_SPEC.md`]: '# manifest\n',
      [`${PRODUCT}/demo/skill.manifest.json`]: manifest(['references/standards/APP_MANIFEST_SPEC.md']),
    })
    expect(collectSkillPortabilityViolations(root)).toEqual([])
  })

  it('rejects a package manifest whose file hash is stale or whose file is missing', () => {
    const root = fixture({
      [`${PRODUCT}/demo/SKILL.md`]: 'Read [a](references/a.md).\n',
      [`${PRODUCT}/demo/references/a.md`]: '# a\n',
      [`${PRODUCT}/demo/skill.manifest.json`]: JSON.stringify({
        name: 'demo', scope: 'product',
        files: [
          { path: 'references/a.md', sha256: '0'.repeat(64) },
          { path: 'references/missing.md', sha256: '1'.repeat(64) },
        ],
      }),
    })
    const findings = collectSkillPortabilityViolations(root)
    expect(findings).toContainEqual(expect.objectContaining({ rule: 'manifest-hash-stale' }))
    expect(findings).toContainEqual(expect.objectContaining({ rule: 'manifest-file-missing' }))
  })

  it('reports a repository dead link as a warning, not an error', () => {
    const root = fixture({
      [`${REPO}/repo-skill/SKILL.md`]: 'See [host docs](../docs/missing.md).\n',
    })
    const findings = collectSkillPortabilityViolations(root)
    expect(findings).toContainEqual(expect.objectContaining({ rule: 'missing-target', severity: 'warning' }))
    expect(findings.some(item => item.severity === 'error')).toBe(false)
  })

  it('rejects a repository skill that declares product scope', () => {
    const root = fixture({
      [`${REPO}/repo-skill/SKILL.md`]: '# repo\n',
      [`${REPO}/repo-skill/skill.manifest.json`]: JSON.stringify({ name: 'repo-skill', scope: 'product', files: [] }),
    })
    expect(collectSkillPortabilityViolations(root)).toContainEqual(expect.objectContaining({
      rule: 'scope-mismatch', severity: 'error',
    }))
  })
})
