import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectBuiltinSceneSkillViolations } from './verify-builtin-scene-skills.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A repository fixture carrying only the two files the gate reads. */
function fixtureRoot(tags: readonly string[], shipped: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-builtin-scene-skills-'))
  roots.push(root)
  const tagsFile = join(root, 'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts')
  mkdirSync(dirname(tagsFile), { recursive: true })
  writeFileSync(tagsFile, [
    'export const SCENE_SKILLS = {',
    '  code: [',
    ...tags.map(name => `    { skill: '${name}', labelKey: 'heroTag.x' },`),
    '  ],',
    '}',
    '',
  ].join('\n'))
  for (const name of shipped) {
    const file = join(root, 'packages/skill/sdkwork-builtin-skills/assets/skills', name, 'SKILL.md')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `---\nname: ${name}\ndescription: Fixture skill\n---\n\nBody.\n`)
  }
  return root
}

describe('bundled scene-skill gate', () => {
  it('accepts a tag table whose every name is packaged', () => {
    expect(collectBuiltinSceneSkillViolations(fixtureRoot(['birdcoder-one', 'birdcoder-two'], ['birdcoder-one', 'birdcoder-two'])))
      .toEqual([])
  })

  it('rejects a tag with no packaged skill, a packaged orphan, and a name mismatch', () => {
    const root = fixtureRoot(['birdcoder-one', 'birdcoder-missing'], ['birdcoder-one', 'birdcoder-orphan'])
    expect(collectBuiltinSceneSkillViolations(root)).toEqual([
      'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts: tag "birdcoder-missing"'
      + ' has no packages/skill/sdkwork-builtin-skills/assets/skills/birdcoder-missing/SKILL.md',
      'packages/skill/sdkwork-builtin-skills/assets/skills/birdcoder-orphan: ships a skill no scene tag can insert',
    ])

    const mismatched = fixtureRoot(['birdcoder-one'], ['birdcoder-one'])
    const file = join(mismatched, 'packages/skill/sdkwork-builtin-skills/assets/skills/birdcoder-one/SKILL.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('name: birdcoder-one', 'name: other-name'))
    expect(collectBuiltinSceneSkillViolations(mismatched)).toEqual([
      'packages/skill/sdkwork-builtin-skills/assets/skills/birdcoder-one/SKILL.md: frontmatter name is "other-name"',
    ])
  })

  it('rejects a duplicated tag and a missing table', () => {
    const root = fixtureRoot(['birdcoder-one', 'birdcoder-one'], ['birdcoder-one'])
    expect(collectBuiltinSceneSkillViolations(root)).toEqual([
      'packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts: tag "birdcoder-one" is declared twice',
    ])
    expect(collectBuiltinSceneSkillViolations(resolve(root, 'absent')))
      .toEqual(['packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts: missing the composer scene-skill table'])
  })

  it('reports an empty tag table and a missing packaged root', () => {
    const empty = fixtureRoot([], [])
    expect(collectBuiltinSceneSkillViolations(empty))
      .toEqual(['packages/client/ui-sdkwork-app-modes/src/client/scene-skills.ts: declares no scene-skill tags'])

    expect(collectBuiltinSceneSkillViolations(fixtureRoot(['birdcoder-one'], []))).toEqual([
      'packages/skill/sdkwork-builtin-skills/assets/skills: missing the bundled scene-skill root',
    ])
  })
})
