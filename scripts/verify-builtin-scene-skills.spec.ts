import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectBuiltinSceneSkillViolations } from './verify-builtin-scene-skills.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Repository-relative paths of the two projections the gate reads. */
const COMPOSER = 'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts'
const MANAGER = 'packages/client/ui-sdkwork-skills/src/client/skill-scenes.ts'
const SKILLS = 'packages/skill/sdkwork-builtin-skills/assets/skills'

/** One project's names, or undefined to leave that projection file unwritten. */
interface Fixture {
  /** Names the composer scene-skill table declares. */
  readonly composer?: readonly string[]
  /** Names the skill manager scene projection declares. Omit to mirror the composer. */
  readonly manager?: readonly string[]
  /** Skill directories the bundle ships. */
  readonly shipped?: readonly string[]
}

/** A repository fixture carrying the projections and the packaged skills. */
function fixtureRoot(options: Fixture): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-builtin-scene-skills-'))
  roots.push(root)
  const composer = options.composer ?? []
  const manager = options.manager ?? composer
  write(root, COMPOSER, [
    'export const SCENE_SKILLS = {',
    '  code: [',
    ...composer.map(name => `    { skill: '${name}', labelKey: 'heroTag.x' },`),
    '  ],',
    '}',
    '',
  ].join('\n'))
  write(root, MANAGER, [
    'export const SKILL_SCENES: ReadonlyMap = {',
    ...manager.map(name => `  '${name}': { group: 'code', labelKey: 'skill.x' },`),
    '}',
    '',
  ].join('\n'))
  for (const name of options.shipped ?? composer) {
    write(root, `${SKILLS}/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Fixture skill\n---\n\nBody.\n`)
  }
  return root
}

/** Write one fixture file, creating its directory. */
function write(root: string, relative: string, body: string): void {
  const file = join(root, relative)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

describe('bundled scene-skill gate', () => {
  it('accepts two projections whose every name is packaged', () => {
    expect(collectBuiltinSceneSkillViolations(fixtureRoot({
      composer: ['birdcoder-one', 'birdcoder-two'],
      shipped: ['birdcoder-one', 'birdcoder-two'],
    }))).toEqual([])
  })

  it('rejects a name with no packaged skill, a packaged orphan, and a name mismatch', () => {
    const root = fixtureRoot({
      composer: ['birdcoder-one', 'birdcoder-missing'],
      manager: ['birdcoder-one', 'birdcoder-missing'],
      shipped: ['birdcoder-one', 'birdcoder-orphan'],
    })
    expect(collectBuiltinSceneSkillViolations(root)).toEqual([
      `${COMPOSER}: "birdcoder-missing" has no ${SKILLS}/birdcoder-missing/SKILL.md`,
      `${MANAGER}: "birdcoder-missing" has no ${SKILLS}/birdcoder-missing/SKILL.md`,
      `${SKILLS}/birdcoder-orphan: ships a skill no fork projection names`,
    ])

    const mismatched = fixtureRoot({ composer: ['birdcoder-one'] })
    const file = join(mismatched, `${SKILLS}/birdcoder-one/SKILL.md`)
    writeFileSync(file, readFileSync(file, 'utf8').replace('name: birdcoder-one', 'name: other-name'))
    expect(collectBuiltinSceneSkillViolations(mismatched)).toEqual([
      `${SKILLS}/birdcoder-one/SKILL.md: frontmatter name is "other-name"`,
    ])
  })

  it('rejects a projection that forgets a name its sibling declares', () => {
    const root = fixtureRoot({
      composer: ['birdcoder-one', 'birdcoder-two'],
      manager: ['birdcoder-one'],
      shipped: ['birdcoder-one', 'birdcoder-two'],
    })

    expect(collectBuiltinSceneSkillViolations(root)).toEqual([
      `${MANAGER}: does not name "birdcoder-two", which ${COMPOSER} declares`,
    ])
  })

  it('rejects a name declared twice in either projection', () => {
    const root = fixtureRoot({
      composer: ['birdcoder-one', 'birdcoder-one'],
      manager: ['birdcoder-one', 'birdcoder-one'],
    })

    expect(collectBuiltinSceneSkillViolations(root)).toEqual([
      `${COMPOSER}: names "birdcoder-one" twice`,
      `${MANAGER}: names "birdcoder-one" twice`,
    ])
  })

  it('reports an empty projection, a missing projection, and a missing packaged root', () => {
    const empty = fixtureRoot({ composer: [], manager: [], shipped: ['birdcoder-one'] })
    expect(collectBuiltinSceneSkillViolations(empty)).toEqual([
      `${COMPOSER}: declares no skill names`,
      `${MANAGER}: declares no skill names`,
      `${SKILLS}/birdcoder-one: ships a skill no fork projection names`,
    ])

    const absent = fixtureRoot({ composer: ['birdcoder-one'], shipped: ['birdcoder-one'] })
    rmSync(join(absent, MANAGER))
    expect(collectBuiltinSceneSkillViolations(absent))
      .toEqual([`${MANAGER}: missing the skill manager scene projection`])

    expect(collectBuiltinSceneSkillViolations(resolve(absent, 'nowhere')))
      .toEqual([`${SKILLS}: missing the bundled scene-skill root`])
  })
})
