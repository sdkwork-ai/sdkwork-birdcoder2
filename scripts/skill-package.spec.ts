/**
 * Skill distribution: verify, pack and install one skill package, including the
 * stale-manifest, unlisted-file and unsafe-ZIP refusals.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fileSha256,
  installSkill,
  packSkill,
  SkillPackageError,
  verifySkillPackage,
} from './skill-package-lib.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A temporary directory that is removed after the test. */
function temporary(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  roots.push(directory)
  return directory
}

/** Write one fixture file, creating parents. */
function write(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

/** A verified fixture skill with a manifest over its files. */
function skill(): string {
  const directory = temporary('skill-package-fixture-')
  write(directory, 'SKILL.md', '---\nname: demo\ndescription: Use when testing.\n---\n\nSee [a](references/a.md).\n')
  write(directory, 'references/a.md', '# a\n')
  write(directory, 'scripts/run.mjs', 'console.log("run")\n')
  write(directory, 'skill.manifest.json', JSON.stringify({
    name: 'demo',
    version: '1.0.0',
    scope: 'product',
    requires: ['references/a.md', 'scripts/run.mjs'],
    files: ['SKILL.md', 'references/a.md', 'scripts/run.mjs'].map(path => ({ path, sha256: fileSha256(join(directory, path)) })),
  }, null, 2))
  return directory
}

/** Run a package operation and return its error code. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'NO_ERROR'
  } catch (error) {
    return error instanceof SkillPackageError ? error.code : 'UNKNOWN'
  }
}

describe('skill package verification', () => {
  it('accepts a complete package and rejects a stale hash', () => {
    const directory = skill()
    expect(verifySkillPackage(directory).name).toBe('demo')
    write(directory, 'references/a.md', '# changed\n')
    expect(codeOf(() => verifySkillPackage(directory))).toBe('HASH_MISMATCH')
  })

  it('rejects an unlisted file and a missing file', () => {
    const unlisted = skill()
    write(unlisted, 'references/extra.md', '# extra\n')
    expect(codeOf(() => verifySkillPackage(unlisted))).toBe('UNLISTED_FILE')
    const missing = skill()
    rmSync(join(missing, 'scripts', 'run.mjs'))
    expect(codeOf(() => verifySkillPackage(missing))).toBe('FILE_MISSING')
  })

  it('rejects a manifest that omits SKILL.md or a required file', () => {
    const noEntry = skill()
    write(noEntry, 'skill.manifest.json', JSON.stringify({
      name: 'demo', version: '1.0.0', files: [{ path: 'references/a.md' }],
    }))
    expect(codeOf(() => verifySkillPackage(noEntry))).toBe('REQUIRED_MISSING')
    const badRequires = skill()
    write(badRequires, 'skill.manifest.json', JSON.stringify({
      name: 'demo', version: '1.0.0', requires: ['scripts/absent.mjs'],
      files: ['SKILL.md', 'references/a.md', 'scripts/run.mjs'].map(path => ({ path })),
    }))
    expect(codeOf(() => verifySkillPackage(badRequires))).toBe('REQUIRED_MISSING')
  })
})

describe('skill packing', () => {
  it('packs a verified package with a checksum and descriptor', () => {
    const directory = skill()
    const outDir = temporary('skill-package-out-')
    const packed = packSkill({ directory, outDir })
    expect(existsSync(packed.archivePath)).toBe(true)
    expect(packed.files).toBe(3)
    expect(packed.checksum).toBe(createHash('sha256').update(readFileSync(packed.archivePath)).digest('hex'))
    const descriptor = JSON.parse(readFileSync(join(outDir, 'demo-1.0.0.json'), 'utf8'))
    expect(descriptor).toMatchObject({ name: 'demo', version: '1.0.0', checksum: packed.checksum, archive: 'demo-1.0.0.zip' })
    expect(readFileSync(join(outDir, 'demo-1.0.0.zip.sha256'), 'utf8')).toContain(packed.checksum)
  })

  it('refuses to pack a stale package', () => {
    const directory = skill()
    write(directory, 'SKILL.md', 'changed\n')
    expect(codeOf(() => packSkill({ directory, outDir: temporary('skill-package-out-') }))).toBe('HASH_MISMATCH')
  })
})

describe('skill installation', () => {
  it('installs a ZIP into an empty skills root and verifies it', () => {
    const directory = skill()
    const outDir = temporary('skill-package-out-')
    const packed = packSkill({ directory, outDir })
    const skillsRoot = temporary('skills-root-')
    const installed = installSkill({ from: packed.archivePath, skillsRoot })
    expect(installed.installedAt).toBe(join(skillsRoot, 'demo'))
    expect(verifySkillPackage(installed.installedAt).name).toBe('demo')
    expect(existsSync(join(installed.installedAt, 'references', 'a.md'))).toBe(true)
  })

  it('installs a directory and refuses to overwrite without force', () => {
    const directory = skill()
    const skillsRoot = temporary('skills-root-')
    installSkill({ from: directory, skillsRoot })
    expect(codeOf(() => installSkill({ from: directory, skillsRoot }))).toBe('TARGET_EXISTS')
    expect(installSkill({ from: directory, skillsRoot, force: true }).replaced).toBe(true)
  })

  it('rejects a ZIP entry that escapes the package', () => {
    const archive = temporary('skill-package-zip-')
    const zipPath = join(archive, 'evil.zip')
    writeFileSync(zipPath, zipSync({
      'skill.manifest.json': [new TextEncoder().encode(JSON.stringify({ name: 'evil', version: '1.0.0', files: [] })), { mtime: 315532800000 }],
      '../escape.md': [new TextEncoder().encode('x'), { mtime: 315532800000 }],
    } as unknown as Parameters<typeof zipSync>[0], { level: 9 }))
    expect(codeOf(() => installSkill({ from: zipPath, skillsRoot: temporary('skills-root-') }))).toBe('UNSAFE_ENTRY')
  })

  it('rejects an archive without a manifest', () => {
    const archive = temporary('skill-package-zip-')
    const zipPath = join(archive, 'empty.zip')
    writeFileSync(zipPath, zipSync({ 'SKILL.md': new TextEncoder().encode('# x') }, { level: 9 }))
    expect(codeOf(() => installSkill({ from: zipPath, skillsRoot: temporary('skills-root-') }))).toBe('MANIFEST_MISSING')
  })
})
