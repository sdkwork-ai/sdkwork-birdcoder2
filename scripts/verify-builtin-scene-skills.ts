/**
 * Keep the composer's scene-skill tags and the bundled skill package in step.
 *
 * The tag strip inserts a literal `/birdcoder-<tag>` name, and that name is a
 * reference, a preview, and an injectable body only while the packaged skill
 * root answers for it. A tag with no shipped skill is the exact defect this
 * gate exists to catch: the token silently degrades to plain text. A packaged
 * skill with no tag is the mirror case — dead weight that ships to every
 * install.
 *
 * @module scripts/verify-builtin-scene-skills
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

/** Where the composer declares the tags it can insert. */
const TAGS_SOURCE = 'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts'

/** The package that must ship every one of those tags as a real skill. */
const PACKAGE_SKILLS = 'packages/skill/sdkwork-builtin-skills/assets/skills'

/** One `skill: '<name>'` entry of the tag table. */
const TAG_ENTRY = /skill:\s*(['"])([^'"]+)\1/gu

/** Return the tag names the composer's scene table declares, in source order. */
function tagSkillNames(source: string): string[] {
  return [...source.matchAll(TAG_ENTRY)].map(match => match[2] as string)
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
 * Report mismatches between the composer's scene tags and the packaged skills.
 * @param root - repository root holding both the tag table and the package.
 * @returns diagnostics for unshipped tags, orphaned skills, and malformed entries.
 */
export function collectBuiltinSceneSkillViolations(root: string): string[] {
  const violations: string[] = []
  const tagsFile = resolve(root, TAGS_SOURCE)
  if (!existsSync(tagsFile)) {
    return [`${TAGS_SOURCE}: missing the composer scene-skill table`]
  }
  const tags = tagSkillNames(readFileSync(tagsFile, 'utf8'))
  if (tags.length === 0) return [`${TAGS_SOURCE}: declares no scene-skill tags`]

  const seen = new Set<string>()
  for (const name of tags) {
    if (seen.has(name)) violations.push(`${TAGS_SOURCE}: tag ${JSON.stringify(name)} is declared twice`)
    seen.add(name)
  }

  const skillsRoot = resolve(root, PACKAGE_SKILLS)
  if (!existsSync(skillsRoot)) {
    return [...violations, `${PACKAGE_SKILLS}: missing the bundled scene-skill root`]
  }
  const shipped = readdirSync(skillsRoot)
    .filter(entry => statSync(resolve(skillsRoot, entry)).isDirectory())
    .sort()

  for (const name of [...seen].sort()) {
    if (!shipped.includes(name)) {
      violations.push(`${TAGS_SOURCE}: tag ${JSON.stringify(name)} has no ${PACKAGE_SKILLS}/${name}/SKILL.md`)
      continue
    }
    const declared = frontmatterName(resolve(skillsRoot, name, 'SKILL.md'))
    if (declared !== name) {
      violations.push(`${PACKAGE_SKILLS}/${name}/SKILL.md: frontmatter name is ${JSON.stringify(declared)}`)
    }
  }

  for (const name of shipped) {
    if (!seen.has(name)) {
      violations.push(`${PACKAGE_SKILLS}/${name}: ships a skill no scene tag can insert`)
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

  const tags = tagSkillNames(readFileSync(resolve(root, TAGS_SOURCE), 'utf8'))
  process.stdout.write(
    `verify-builtin-scene-skills: ${String(new Set(tags).size)} scene tag(s) resolve to packaged skills.\n`,
  )
}
