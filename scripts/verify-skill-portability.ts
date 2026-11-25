/**
 * Verify that every skill is either portable or explicitly repository-bound.
 *
 * A **product skill** ships to every installation: its entrypoint may only point
 * at files inside its own directory, never at a `sdkwork-specs` checkout, a
 * repository `docs/` tree or a parent path. A skill that carries `references/` or
 * `scripts/` must declare a `skill.manifest.json` so an installer can prove the
 * package is complete.
 *
 * A **repository skill** (`.agents/skills`, the preset's developer skills) may
 * cite the checkout it lives in, but a dead relative link is still reported as a
 * warning.
 *
 * @module scripts/verify-skill-portability
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The two scopes a skill ships under. */
export type SkillScope = 'product' | 'repository'

/** The skill roots and the scope each one ships under. */
export const SKILL_ROOTS: readonly { directory: string; scope: SkillScope }[] = [
  { directory: 'packages/skill/sdkwork-builtin-skills/assets/skills', scope: 'product' },
  { directory: 'packages/preset/agent-preset/skills', scope: 'repository' },
  { directory: '.agents/skills', scope: 'repository' },
]

/** One portability finding. */
export interface SkillPortabilityViolation {
  readonly scope: SkillScope
  readonly severity: 'error' | 'warning'
  readonly skill: string
  readonly file: string
  readonly rule: string
  readonly target?: string
}

/** Recursively list files under a directory, skipping absent ones. */
function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else if (path.endsWith('.md')) files.push(path)
  }
  return files
}

/** Every relative markdown link target in one file. */
function links(text: string): string[] {
  const targets: string[] = []
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
    const target = match[1] ?? ''
    if (target === '' || /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|#)/iu.test(target)) continue
    targets.push(target.split('#')[0] ?? '')
  }
  return targets
}

/** True for an absolute filesystem path in either platform's spelling. */
function isAbsoluteTarget(target: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(target) || target.startsWith('/') || target.startsWith('\\\\')
}

/**
 * Collect portability findings for every skill under one repository root.
 * @param {string} [root] repository root; defaults to this checkout.
 * @returns {SkillPortabilityViolation[]} errors and warnings, in root order.
 */
export function collectSkillPortabilityViolations(root = ROOT): SkillPortabilityViolation[] {
  const violations: SkillPortabilityViolation[] = []
  const productRoot = SKILL_ROOTS.find(entry => entry.scope === 'product')
  const productNames = new Set<string>(
    productRoot === undefined || !existsSync(join(root, productRoot.directory))
      ? []
      : readdirSync(join(root, productRoot.directory))
        .filter(name => existsSync(join(root, productRoot.directory, name, 'SKILL.md'))),
  )
  for (const { directory, scope: declaredScope } of SKILL_ROOTS) {
    const skillsRoot = join(root, directory)
    if (!existsSync(skillsRoot)) continue
    for (const skill of readdirSync(skillsRoot).sort()) {
      const skillDir = join(skillsRoot, skill)
      if (!statSync(skillDir).isDirectory() || !existsSync(join(skillDir, 'SKILL.md'))) continue
      // A repository root also carries the authoring mirror of every product
      // skill; those mirrors keep the product rules, not the repository ones.
      const scope = productNames.has(skill) ? 'product' : declaredScope
      const manifestPath = join(skillDir, 'skill.manifest.json')
      const manifest = readManifest(manifestPath)
      if (scope === 'repository' && manifest !== undefined && manifest.scope !== 'repository') {
        violations.push(finding(scope, 'error', skill, 'skill.manifest.json', 'scope-mismatch'))
      }
      const packaged = new Set((manifest?.files ?? []).map(file => file.path))
      if (scope === 'product' && manifest !== undefined) {
        for (const file of manifest.files ?? []) {
          if (file.sha256 === undefined) continue
          const path = join(skillDir, file.path)
          if (!existsSync(path)) {
            violations.push(finding(scope, 'error', skill, 'skill.manifest.json', 'manifest-file-missing', file.path))
            continue
          }
          const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
          if (digest !== file.sha256) {
            violations.push(finding(scope, 'error', skill, 'skill.manifest.json', 'manifest-hash-stale', file.path))
          }
        }
      }
      const hasAssets = existsSync(join(skillDir, 'references')) || existsSync(join(skillDir, 'scripts'))
      if (scope === 'product' && hasAssets) {
        if (manifest === undefined) {
          violations.push(finding(scope, 'error', skill, 'skill.manifest.json', 'manifest-missing'))
        } else if (manifest.scope !== 'product') {
          violations.push(finding(scope, 'error', skill, 'skill.manifest.json', 'scope-mismatch'))
        }
      }
      for (const file of walk(skillDir)) {
        const relativeFile = relative(root, file).replace(/\\/gu, '/')
        const text = readFileSync(file, 'utf8')
        if (scope === 'product') {
          for (const line of text.split(/\r?\n/u)) {
            const command = line.trim().startsWith('node ') || line.trim().startsWith('pnpm ')
            if (/(?:\.\.\/)+sdkwork-specs/u.test(line)
              || /\]\(\s*sdkwork-specs\//u.test(line)
              || (command && /\bsdkwork-specs\//u.test(line))) {
              violations.push(finding(scope, 'error', skill, relativeFile, 'external-spec-path'))
              break
            }
          }
        }
        for (const target of links(text)) {
          if (isAbsoluteTarget(target)) {
            if (scope === 'product') violations.push(finding(scope, 'error', skill, relativeFile, 'absolute-path', target))
            continue
          }
          if (scope === 'product' && target.startsWith('../')) {
            violations.push(finding(scope, 'error', skill, relativeFile, 'parent-path', target))
            continue
          }
          const resolved = resolve(dirname(file), target)
          if (!existsSync(resolved)) {
            violations.push(finding(scope, scope === 'product' ? 'error' : 'warning', skill, relativeFile, 'missing-target', target))
            continue
          }
          if (scope === 'product' && manifest !== undefined && (target.startsWith('references/') || target.startsWith('scripts/') || target.startsWith('assets/'))) {
            const covered = packaged.has(target)
              || (target.endsWith('/') && [...packaged].some(path => path.startsWith(target)))
            if (!covered) violations.push(finding(scope, 'error', skill, relativeFile, 'not-packaged', target))
          }
        }
      }
    }
  }
  return violations
}

/** One finding. */
function finding(
  scope: SkillScope,
  severity: 'error' | 'warning',
  skill: string,
  file: string,
  rule: string,
  target?: string,
): SkillPortabilityViolation {
  return { scope, severity, skill, file, rule, ...(target === undefined ? {} : { target }) }
}

/** A skill package manifest, as far as portability reads it. */
interface SkillPackageManifest {
  readonly scope?: string
  readonly files?: { path: string; sha256?: string }[]
}

/** True when a parsed JSON value is an object this reader can inspect. */
function isManifestObject(value: unknown): value is SkillPackageManifest {
  return typeof value === 'object' && value !== null
}

/** Read a skill package manifest, tolerating absence or damage. */
function readManifest(path: string): SkillPackageManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isManifestObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * CLI entry.
 * @param {string[]} argv arguments after the script path.
 * @returns {number} process exit code.
 */
export function main(argv: string[]): number {
  const rootIndex = argv.indexOf('--root')
  const findings = collectSkillPortabilityViolations(rootIndex === -1 ? ROOT : resolve(argv[rootIndex + 1] ?? ROOT))
  const errors = findings.filter(item => item.severity === 'error')
  const warnings = findings.filter(item => item.severity === 'warning')
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ errors, warnings }, null, 2)}\n`)
  } else {
    for (const item of findings) {
      process.stdout.write(`${item.severity} [${item.scope}] ${item.skill} ${item.file}: ${item.rule}${item.target === undefined ? '' : ` (${item.target})`}\n`)
    }
    process.stdout.write(`verify-skill-portability: ${errors.length} error(s), ${warnings.length} warning(s)\n`)
  }
  return errors.length === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
