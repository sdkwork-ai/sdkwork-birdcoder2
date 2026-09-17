import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { buildCatalog, commandKindOf, commandVariantOf, familyIdOf } from '../src/catalog.ts'
import type { CatalogFsPort } from '../src/catalog.ts'
import { createHostFacts } from '../src/capability.ts'
import { SdkworkAppBuildRunner } from '../src/index.ts'
import type { SdkworkAppBuildHostFacts } from '../src/types.ts'

const directories: string[] = []
const contexts: Context[] = []

/** Host facts with no tools and no environment: pure rules, no machine. */
function factsOn(os: SdkworkAppBuildHostFacts['os']): SdkworkAppBuildHostFacts {
  return createHostFacts({}, os === 'windows' ? 'win32' : os === 'macos' ? 'darwin' : 'linux', 'x64')
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function harness(): Promise<SdkworkAppBuildRunner> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SdkworkAppBuildRunner)
  return ctx.get('sdkworkAppBuild') as SdkworkAppBuildRunner
}

/** Materialize a workspace with the given `apps/<name>/package.json` script sets. */
async function workspace(apps: Record<string, Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sdkwork-catalog-'))
  directories.push(root)
  for (const [name, scripts] of Object.entries(apps)) {
    await mkdir(join(root, 'apps', name), { recursive: true })
    await writeFile(join(root, 'apps', name, 'package.json'), JSON.stringify({ scripts }))
  }
  return root
}

describe('familyIdOf', () => {
  it('matches a family suffix on an app-root directory name', () => {
    expect(familyIdOf('sdkwork-birdcoder2-h5')).toBe('h5')
    expect(familyIdOf('sdkwork-drive-pc')).toBe('pc')
    expect(familyIdOf('sdkwork-im-flutter-mobile')).toBe('flutter-mobile')
    expect(familyIdOf('sdkwork-im-mini-program')).toBe('mini-program')
    expect(familyIdOf('desktop')).toBe('desktop')
  })

  it('ignores directories that name no family', () => {
    // Shared code lives under apps/ too (`-common`); it is not a client surface.
    expect(familyIdOf('sdkwork-drive-common')).toBeUndefined()
    expect(familyIdOf('web')).toBeUndefined()
    expect(familyIdOf('cli')).toBeUndefined()
    expect(familyIdOf('desktop-host')).toBeUndefined()
  })
})

describe('commandKindOf', () => {
  it('classifies build and package scripts and ignores everything else', () => {
    expect(commandKindOf('build')).toBe('build')
    expect(commandKindOf('build:prod')).toBe('build')
    expect(commandKindOf('build:h5:prod:cloud')).toBe('build')
    expect(commandKindOf('package')).toBe('package')
    expect(commandKindOf('package:win:x64')).toBe('package')
    expect(commandKindOf('release:package:standalone')).toBe('package')
    // Not menu actions: run servers, checks and gates.
    expect(commandKindOf('dev')).toBeUndefined()
    expect(commandKindOf('dev:standalone')).toBeUndefined()
    expect(commandKindOf('test')).toBeUndefined()
    expect(commandKindOf('check:manifest')).toBeUndefined()
    expect(commandKindOf('verify')).toBeUndefined()
    expect(commandKindOf('typecheck')).toBeUndefined()
  })
})

describe('commandVariantOf', () => {
  it('strips the verb and the family-denoting segment', () => {
    expect(commandVariantOf('build', 'h5')).toBe('default')
    expect(commandVariantOf('build:dev', 'h5')).toBe('dev')
    expect(commandVariantOf('build:dev:cloud', 'h5')).toBe('dev · cloud')
    expect(commandVariantOf('build:browser', 'h5')).toBe('browser')
    // The mini-program root names its own family inside the script name.
    expect(commandVariantOf('build:mini-program:prod', 'mini-program')).toBe('prod')
    // The flutter root names its targets after the family stem.
    expect(commandVariantOf('build:flutter-android', 'flutter-mobile')).toBe('android')
    expect(commandVariantOf('build:flutter-ios:prod', 'flutter-mobile')).toBe('ios · prod')
    expect(commandVariantOf('package:win:x64', 'desktop')).toBe('win · x64')
  })
})

describe('buildCatalog', () => {
  /**
   * In-memory filesystem port over a `path → contents` map. Keys are written
   * with forward slashes; both lookups normalize, because `path.join` hands
   * the probe backslashes on Windows and the fixture literals must not have
   * to care.
   */
  function portOf(files: Record<string, string>): CatalogFsPort {
    const entries = Object.entries(files)
      .map(([path, body]) => [path.replace(/\\/g, '/'), body] as const)
    return {
      directories: (path) => {
        const prefix = `${path.replace(/\\/g, '/')}/`
        const found = new Set<string>()
        for (const [file] of entries) {
          if (!file.startsWith(prefix)) continue
          const rest = file.slice(prefix.length)
          const separator = rest.indexOf('/')
          if (separator > 0) found.add(rest.slice(0, separator))
        }
        return [...found]
      },
      readFile: (path) => {
        const target = path.replace(/\\/g, '/')
        return entries.find(([file]) => file === target)?.[1]
      },
    }
  }

  it('collects recognised families with their compile and package commands', () => {
    const catalog = buildCatalog('/w', portOf({
      '/w/apps/demo-h5/package.json': JSON.stringify({
        scripts: { dev: 'x', 'build:dev': 'y', 'build:prod:cloud': 'z', 'package:h5': 'p' },
      }),
      '/w/apps/demo-common/package.json': JSON.stringify({ scripts: { build: 'shared' } }),
    }), factsOn('linux'))
    expect(catalog.families.map(family => family.id)).toEqual(['h5'])
    const family = catalog.families[0]
    expect(family?.root).toBe('demo-h5')
    // Platform separator belongs to the probe, not the fixture literal.
    expect(family?.rootPath).toBe(join('/w', 'apps', 'demo-h5'))
    expect(family?.build.map(command => command.script)).toEqual(['build:dev', 'build:prod:cloud'])
    expect(family?.build[1]?.deploymentProfile).toBe('cloud')
    expect(family?.build[1]?.environment).toBe('prod')
    expect(family?.package.map(command => command.script)).toEqual(['package:h5'])
  })

  it('reports the standard families this workspace cannot build', () => {
    const catalog = buildCatalog('/w', portOf({}), factsOn('linux'))
    expect(catalog.families).toEqual([])
    expect(catalog.missing.map(entry => entry.id)).toEqual(
      ['h5', 'pc', 'flutter-mobile', 'mini-program', 'desktop', 'harmony'],
    )
    expect(catalog.missing.find(entry => entry.id === 'harmony')?.reason).toBe('toolchain-not-wired')
    expect(catalog.missing.find(entry => entry.id === 'h5')?.reason).toBe('no-app-root')
  })

  it('degrades to an empty catalog when apps/ is unreadable', () => {
    expect(buildCatalog('/missing', portOf({}), factsOn('linux')).families).toEqual([])
  })

  it('skips an app root whose package.json carries no action script', () => {
    const catalog = buildCatalog('/w', portOf({
      '/w/apps/demo-pc/package.json': JSON.stringify({ scripts: { dev: 'x', test: 'y' } }),
    }), factsOn('linux'))
    expect(catalog.families).toEqual([])
  })
})

describe('SdkworkAppBuildRunner.describe', () => {
  it('probes a real workspace tree', async () => {
    const root = await workspace({
      'demo-h5': { dev: 'x', 'build:prod': 'y' },
      'demo-flutter-mobile': { 'build:flutter-android': 'a', 'build:flutter-ios:prod': 'b' },
      'demo-common': { build: 'shared' },
    })
    const catalog = (await harness()).describe({ cwd: root })
    expect(catalog.families.map(family => family.id)).toEqual(['h5', 'flutter-mobile'])
    expect(catalog.families[1]?.build.map(command => command.variant)).toEqual(['android', 'ios · prod'])
    // Requirements are host-independent, so they can be pinned here; the
    // verdict they produce is asserted against a fixed host elsewhere
    // (`capability.spec.ts`), which is the only place it is deterministic.
    expect(catalog.families[1]?.build[0]?.requirements.tools).toEqual(['flutter'])
    expect(catalog.families[1]?.build[1]?.requirements.hostOs).toEqual(['macos'])
    // A portable script with no entry file and no tool requirement runs
    // anywhere, so this verdict holds on every host the suite may run on.
    expect(catalog.families[0]?.build[0]?.runnable).toBe(true)
    expect(catalog.families[0]?.build[0]?.blockedBy).toBeNull()
    expect(catalog.missing.map(entry => entry.id)).toContain('harmony')
  })
})
