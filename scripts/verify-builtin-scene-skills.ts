/**
 * Keep every fork-owned projection of the built-in skill set in step with the
 * bundled skill package.
 *
 * Two fork surfaces name the built-in skills, and both name them as literals:
 * the composer's scene tags, which insert a `/birdcoder-<tag>` token, and the
 * skill manager's scene projection, which gives each one a group and an alias
 * in the settings page. A name is a reference, a preview, and an injectable
 * body only while the packaged skill root answers for it. A name with no
 * shipped skill is the exact defect this gate exists to catch: the token
 * silently degrades to plain text and the manager row shows an alias for a
 * skill that never exists. A packaged skill no projection names is the mirror
 * case — dead weight that ships to every install, and a built-in the manager
 * would file under `other` with no alias at all.
 *
 * The same rule applies to a projection that lists a name twice: the strip
 * would render one pill twice and the manager would fold two configurations of
 * one skill onto a single name. A shipped skill whose `SKILL.md` frontmatter
 * declares another name is rejected for the same reason — the packaged name is
 * what the registry serves, so the token the projections insert would resolve
 * to nothing.
 *
 * @module scripts/verify-builtin-scene-skills
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

/** One fork-owned projection that must name exactly the shipped skills. */
interface SkillProjection {
  /** Repository-relative path of the projection source. */
  readonly file: string
  /** What the projection feeds into, for diagnostics. */
  readonly describes: string
  /** Matcher whose first capture group is one declared skill name. */
  readonly entry: RegExp
}

/** The projections this gate keeps in step with the bundle, in report order. */
const PROJECTIONS: readonly SkillProjection[] = [
  {
    file: 'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts',
    describes: 'composer scene-skill tag table',
    entry: /skill:\s*['"]([^'"]+)['"]/gu,
  },
  {
    file: 'packages/client/ui-sdkwork-skills/src/client/skill-scenes.ts',
    describes: 'skill manager scene projection',
    entry: /^\s*'([^']+)':\s*\{\s*group:/gmu,
  },
]

/** The package that must ship every name those projections declare. */
const PACKAGE_SKILLS = 'packages/skill/sdkwork-builtin-skills/assets/skills'

/** Return the skill names one projection source declares, in source order. */
function declaredNames(source: string, entry: RegExp): string[] {
  return [...source.matchAll(entry)].map(match => match[1] as string)
}

/** Return the `name:` frontmatter value of a `SKILL.md`, or undefined when absent. */
function frontmatterName(file: string): string | undefined {
  const lines = readFileSync(file, 'utf8').split('\n')
  if (lines[0] !== '---') return undefined
  const end = lines.indexOf('---', 1)
  if (end < 0) return undefined
  const metadata: unknown = load(lines.slice(1, end).join('\n'))
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined
  const name = (metadata as Record<string, unknown>).name
  return typeof name === 'string' ? name : undefined
}

/**
 * Report the names one projection declares that the bundle does not ship, plus
 * its duplicate declarations.
 * @param root - repository root holding the projection source.
 * @param projection - the projection to read.
 * @param shipped - the packaged skill directory names, sorted.
 * @returns diagnostics naming the projection file, the names it declares, and
 *   whether the table was readable at all (a missing or empty table reports its
 *   own violation and is left out of the cross-projection comparison).
 */
function projectionViolations(
  root: string,
  projection: SkillProjection,
  shipped: readonly string[],
): { violations: string[]; names: ReadonlySet<string>; usable: boolean } {
  const violations: string[] = []
  const file = resolve(root, projection.file)
  if (!existsSync(file)) {
    return {
      violations: [`${projection.file}: missing the ${projection.describes}`],
      names: new Set(),
      usable: false,
    }
  }
  const names = declaredNames(readFileSync(file, 'utf8'), projection.entry)
  if (names.length === 0) {
    return {
      violations: [`${projection.file}: declares no skill names`],
      names: new Set(),
      usable: false,
    }
  }

  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) violations.push(`${projection.file}: names ${JSON.stringify(name)} twice`)
    seen.add(name)
  }

  for (const name of [...seen].sort()) {
    if (!shipped.includes(name)) {
      violations.push(`${projection.file}: ${JSON.stringify(name)} has no ${PACKAGE_SKILLS}/${name}/SKILL.md`)
    }
  }
  return { violations, names: seen, usable: true }
}

/**
 * Report mismatches between the fork's skill-name projections and the packaged
 * skills: unshipped names, names a projection forgets while a sibling declares
 * them, orphaned skills, and malformed entries.
 * @param root - repository root holding the projections and the package.
 * @returns diagnostics, in projection order, then the orphaned skills.
 */
export function collectBuiltinSceneSkillViolations(root: string): string[] {
  const skillsRoot = resolve(root, PACKAGE_SKILLS)
  if (!existsSync(skillsRoot)) {
    return [`${PACKAGE_SKILLS}: missing the bundled scene-skill root`]
  }
  const shipped = readdirSync(skillsRoot)
    .filter(entry => statSync(resolve(skillsRoot, entry)).isDirectory())
    .sort()

  const violations: string[] = []
  const reports = PROJECTIONS.map((projection) => {
    const report = projectionViolations(root, projection, shipped)
    violations.push(...report.violations)
    return { projection, names: report.names, usable: report.usable }
  })

  const declared = new Set<string>()
  const originOf = new Map<string, string>()
  for (const { projection, names } of reports) {
    for (const name of names) {
      declared.add(name)
      if (!originOf.has(name)) originOf.set(name, projection.file)
    }
  }

  // Every projection has to name the same set: a projection that omits a name
  // its sibling declares is how one surface silently loses a built-in — the
  // composer keeps its pill while the manager files the skill under `other`
  // with no alias, or the reverse. A projection that declared nothing at all
  // reported that instead, so it takes no part in the comparison.
  const origins = [...originOf].sort(([left], [right]) => left.localeCompare(right))
  for (const [name, origin] of origins) {
    for (const { projection, names, usable } of reports) {
      if (!usable || names.has(name)) continue
      violations.push(`${projection.file}: does not name ${JSON.stringify(name)}, which ${origin} declares`)
    }
  }

  // The frontmatter belongs to the packaged skill, not to a projection, so it
  // is checked once per shipped name rather than once per projection.
  for (const name of [...declared].sort()) {
    if (!shipped.includes(name)) continue
    const frontmatter = frontmatterName(resolve(root, PACKAGE_SKILLS, name, 'SKILL.md'))
    if (frontmatter !== name) {
      violations.push(`${PACKAGE_SKILLS}/${name}/SKILL.md: frontmatter name is ${JSON.stringify(frontmatter)}`)
    }
  }

  for (const name of shipped) {
    if (!declared.has(name)) {
      violations.push(`${PACKAGE_SKILLS}/${name}: ships a skill no fork projection names`)
    }
  }

  return violations
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const root = resolve(import.meta.dirname, '..')
  const violations = collectBuiltinSceneSkillViolations(root)
  if (violations.length > 0) {
    process.stderr.write('verify-builtin-scene-skills: violations found:\n')
    for (const violation of violations) process.stderr.write(`  ${violation}\n`)
    process.exit(1)
  }

  const names = new Set<string>()
  for (const projection of PROJECTIONS) {
    for (const name of declaredNames(readFileSync(resolve(root, projection.file), 'utf8'), projection.entry)) {
      names.add(name)
    }
  }
  process.stdout.write(
    `verify-builtin-scene-skills: ${String(names.size)} skill name(s) resolve to packaged skills`
    + ` across ${String(PROJECTIONS.length)} fork projection(s).\n`,
  )
}
