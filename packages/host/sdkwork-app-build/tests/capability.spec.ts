import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assessCommand, assessScript, capabilityTokensOf, createHostFacts, hostArchOf, hostOsOf,
  requirementsOf, scriptEntryPathsOf,
} from '../src/capability.ts'
import { buildCatalog } from '../src/catalog.ts'
import type { SdkworkAppBuildHostFacts } from '../src/types.ts'

/**
 * Host facts with no tools, no environment variables and an explicit OS/CPU.
 * Every verdict below is therefore a pure function of the rules, and the same
 * assertions hold wherever the suite runs — which matters, because the whole
 * point of the capability layer is that the answer depends on the host.
 * @param os - OS to pretend to run on.
 * @param arch - CPU to pretend to run on.
 * @returns the facts.
 */
function factsOn(
  os: SdkworkAppBuildHostFacts['os'], arch: SdkworkAppBuildHostFacts['arch'] = 'x64',
): SdkworkAppBuildHostFacts {
  return createHostFacts({}, os === 'windows' ? 'win32' : os === 'macos' ? 'darwin' : 'linux', arch)
}

/** Host facts with a named tool present, for the runnable side of a rule. */
function withTools(
  base: SdkworkAppBuildHostFacts,
  tools: readonly string[],
  variables: readonly string[] = [],
): SdkworkAppBuildHostFacts {
  return {
    ...base,
    hasTool: name => tools.includes(name),
    hasEnvironmentVariable: name => variables.includes(name),
  }
}

describe('hostOsOf / hostArchOf', () => {
  it('maps the Node platform ids the toolchain branches on', () => {
    expect(hostOsOf('win32')).toBe('windows')
    expect(hostOsOf('darwin')).toBe('macos')
    expect(hostOsOf('linux')).toBe('linux')
    // Anything else is treated as Linux, matching how the roots themselves
    // branch on win32/darwin alone.
    expect(hostOsOf('freebsd')).toBe('linux')
  })

  it('collapses every non-ARM64 host onto x64', () => {
    expect(hostArchOf('arm64')).toBe('arm64')
    expect(hostArchOf('x64')).toBe('x64')
    expect(hostArchOf('ia32')).toBe('x64')
  })
})

describe('capabilityTokensOf', () => {
  it('splits the script name and its body into whole words', () => {
    const tokens = capabilityTokensOf('build:flutter-ios:prod', 'flutter build ipa --dart-define-from-file=env/x.json')
    expect(tokens.has('ios')).toBe(true)
    expect(tokens.has('ipa')).toBe(true)
    expect(tokens.has('flutter')).toBe(true)
    // Whole words only: the substring trap the previous gate fell into.
    expect(tokens.has('i')).toBe(false)
  })
})

describe('scriptEntryPathsOf', () => {
  it('collects the files a script hands to node or tsx', () => {
    expect(scriptEntryPathsOf(
      'node ../../../sdkwork-specs/tools/build-browser-client.mjs --app-root . --environment dev',
    )).toEqual(['../../../sdkwork-specs/tools/build-browser-client.mjs'])
    expect(scriptEntryPathsOf('tsx scripts/package-target.ts mac-arm64')).toEqual(['scripts/package-target.ts'])
  })

  it('collects every entry when a script chains more than one', () => {
    expect(scriptEntryPathsOf('node a/one.mjs && tsx b/two.ts --flag')).toEqual(['a/one.mjs', 'b/two.ts'])
  })

  it('ignores interpreters it cannot resolve and flag values', () => {
    // A flutter command names no entry file at all.
    expect(scriptEntryPathsOf('flutter build appbundle --dart-define-from-file=env/x.json')).toEqual([])
    expect(scriptEntryPathsOf('tsc -b && tsdown')).toEqual([])
  })
})

describe('requirementsOf', () => {
  it('gates desktop packaging on the target platform', () => {
    const win = 'tsx scripts/package-target.ts win-x64'
    expect(requirementsOf('package:win:x64', 'desktop', win).hostOs).toEqual(['windows'])
    expect(requirementsOf('package:linux:x64:unsigned', 'desktop', 'tsx scripts/package-target.ts linux-x64 --unsigned').hostOs)
      .toEqual(['linux'])
    expect(requirementsOf('package:mac:x64', 'desktop', 'tsx scripts/package-target.ts mac-x64').hostOs).toEqual(['macos'])
  })

  it('requires Apple Silicon for the arm64 mac target, and only that one', () => {
    const arm = requirementsOf('package:mac:arm64', 'desktop', 'tsx scripts/package-target.ts mac-arm64')
    expect(arm.hostArch).toBe('arm64')
    const intel = requirementsOf('package:mac:x64', 'desktop', 'tsx scripts/package-target.ts mac-x64')
    expect(intel.hostArch).toBeNull()
  })

  it('leaves a desktop package script with no target portable', () => {
    // `package` and `package:dir` pack the HOST's own target, so they run
    // wherever they are invoked; only the named targets are gated.
    for (const body of ['tsx scripts/package-target.ts', 'tsx scripts/package-target.ts --dir']) {
      const requirements = requirementsOf('package', 'desktop', body)
      expect(requirements.hostOs).toEqual(['windows', 'macos', 'linux'])
      expect(requirements.hostArch).toBeNull()
    }
  })

  it('gates the iOS lane to macOS with Xcode, from the script name alone', () => {
    const ios = requirementsOf('build:flutter-ios:prod', 'flutter-mobile', 'flutter build ipa')
    expect(ios.hostOs).toEqual(['macos'])
    expect(ios.tools).toEqual(['flutter', 'xcodebuild'])
  })

  it('needs the Flutter SDK and an Android SDK for the Android lane', () => {
    const android = requirementsOf('build:flutter-android', 'flutter-mobile', 'flutter build appbundle')
    expect(android.hostOs).toEqual(['windows', 'macos', 'linux'])
    expect(android.tools).toEqual(['flutter'])
    // Either SDK root satisfies it, which is why the groups are groups.
    expect(android.environmentAnyOf).toEqual([['ANDROID_HOME', 'ANDROID_SDK_ROOT']])
  })

  it('needs the Flutter SDK for a bare flutter build', () => {
    expect(requirementsOf('build', 'flutter-mobile', 'flutter build').tools).toEqual(['flutter'])
  })

  it('keeps HarmonyOS off Linux and behind hvigor', () => {
    const harmony = requirementsOf('build', 'harmony', 'hvigorw assembleHap')
    expect(harmony.hostOs).toEqual(['windows', 'macos'])
    expect(harmony.tools).toEqual(['hvigorw'])
  })

  it('leaves browser builds portable', () => {
    for (const family of ['h5', 'pc', 'static-web']) {
      const requirements = requirementsOf('build:prod:cloud', family, 'node tools/build-browser-client.mjs')
      expect(requirements.hostOs).toEqual(['windows', 'macos', 'linux'])
      expect(requirements.tools).toEqual([])
      expect(requirements.environmentAnyOf).toEqual([])
    }
  })
})

describe('assessCommand', () => {
  const portable = requirementsOf('build', 'h5', 'node tools/build.mjs')

  it('reports the platform before the toolchain, so the fix order reads right', () => {
    // The iOS lane on a Windows host: Xcode is missing too, but naming it
    // would be noise — no toolchain change makes this target buildable here.
    const ios = requirementsOf('build:flutter-ios:prod', 'flutter-mobile', 'flutter build ipa')
    const verdict = assessCommand(ios, [], '/w/apps/x', factsOn('windows'))
    expect(verdict).toEqual({ runnable: false, blockedBy: 'platform-unsupported', missing: ['macos'] })
  })

  it('reports an unsatisfied CPU after the platform', () => {
    const arm = requirementsOf('package:mac:arm64', 'desktop', 'tsx scripts/package-target.ts mac-arm64')
    const verdict = assessCommand(arm, [], '/w/apps/desktop', factsOn('macos', 'x64'))
    expect(verdict).toEqual({ runnable: false, blockedBy: 'architecture-unsupported', missing: ['arm64'] })
  })

  it('reports a missing entry file, with the path as the script names it', () => {
    const entry = ['scripts/build-mini-program.mjs']
    const verdict = assessCommand(portable, entry, '/w/apps/mp', factsOn('windows'))
    expect(verdict).toEqual({ runnable: false, blockedBy: 'entry-missing', missing: entry })
  })

  it('reports missing tools and unmet environment groups together', () => {
    const android = requirementsOf('build:flutter-android', 'flutter-mobile', 'flutter build appbundle')
    expect(assessCommand(android, [], '/w/apps/f', factsOn('windows'))).toEqual({
      runnable: false,
      blockedBy: 'toolchain-missing',
      missing: ['flutter', 'ANDROID_HOME | ANDROID_SDK_ROOT'],
    })
    // One of the two SDK roots is enough, and a satisfied tool drops out.
    expect(assessCommand(android, [], '/w/apps/f', withTools(factsOn('windows'), ['flutter'], ['ANDROID_SDK_ROOT'])))
      .toEqual({ runnable: true, blockedBy: null, missing: [] })
  })

  it('clears a command once platform, entry and toolchain all line up', () => {
    const ios = requirementsOf('build:flutter-ios:prod', 'flutter-mobile', 'flutter build ipa')
    expect(assessCommand(ios, [], '/w/apps/f', withTools(factsOn('macos'), ['flutter', 'xcodebuild'])))
      .toEqual({ runnable: true, blockedBy: null, missing: [] })
  })
})

describe('assessScript', () => {
  it('carries the requirements and the verdict together', () => {
    const assessment = assessScript(
      'package:linux:x64:unsigned', 'desktop', 'tsx scripts/package-target.ts linux-x64 --unsigned',
      '/w/apps/desktop', factsOn('windows'),
    )
    expect(assessment.requirements.hostOs).toEqual(['linux'])
    expect(assessment.runnable).toBe(false)
    expect(assessment.blockedBy).toBe('platform-unsupported')
    expect(assessment.missing).toEqual(['linux'])
  })
})

/**
 * The verdicts the real workspace produces, read from the real tree with an
 * explicit Windows host and an empty PATH. This is the acceptance the feature
 * exists for: every row the compile/package submenu offers must either run, or
 * be greyed with the reason it cannot.
 *
 * Assertions are stated as properties (every `<family>/<lane>` row satisfies
 * X) rather than as one snapshot, so adding a script to an app root does not
 * break the suite while a wrong verdict still does.
 */
describe('the real apps/ tree, as a Windows host with no toolchain assesses it', () => {
  const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
  const facts = createHostFacts({}, 'win32', 'x64')
  const catalog = buildCatalog(ROOT, {
    directories: path => readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name),
    readFile: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return undefined
      }
    },
  }, facts)
  const family = (id: string) => catalog.families.find(candidate => candidate.id === id)
  const scripts = (id: string, kind: 'build' | 'package') =>
    (family(id)?.[kind] ?? []).map(command => command.script)
  const verdictOf = (id: string, script: string, kind: 'build' | 'package' = 'build') =>
    (family(id)?.[kind] ?? []).find(command => command.script === script)

  it('discovers the families this workspace really carries', () => {
    expect(catalog.families.map(entry => entry.id)).toEqual([
      'h5', 'pc', 'flutter-mobile', 'mini-program', 'desktop',
    ])
    expect(catalog.missing.map(entry => entry.id)).toEqual(['harmony'])
  })

  it('leaves the browser lanes runnable: they are portable and their tool exists', () => {
    // The one external dependency is a sibling workspace; assert against the
    // tree itself rather than assuming the clone carries it.
    const toolExists = existsSync(join(ROOT, '..', 'sdkwork-specs', 'tools', 'build-browser-client.mjs'))
    expect(scripts('h5', 'build').length).toBeGreaterThan(0)
    for (const id of ['h5', 'pc']) {
      for (const command of family(id)?.build ?? []) {
        expect([command.script, command.runnable]).toEqual([command.script, toolExists])
        expect(command.blockedBy).toBe(toolExists ? null : 'entry-missing')
      }
    }
  })

  it('gates every desktop target to its own platform, and clears the host one', () => {
    expect(verdictOf('desktop', 'package:win:x64', 'package')?.runnable).toBe(true)
    for (const command of family('desktop')?.package ?? []) {
      if (/^package:mac/.test(command.script)) {
        expect([command.script, command.blockedBy]).toEqual([command.script, 'platform-unsupported'])
        expect(command.missing).toEqual(['macos'])
      }
      if (/^package:linux/.test(command.script)) {
        expect([command.script, command.blockedBy]).toEqual([command.script, 'platform-unsupported'])
        expect(command.missing).toEqual(['linux'])
      }
      // `package` / `package:dir` pack the host's own target, so they stay open.
      if (command.script === 'package' || command.script === 'package:dir') {
        expect([command.script, command.runnable]).toEqual([command.script, true])
      }
    }
  })

  it('gates the iOS lane to macOS and the Android lane to the Flutter SDK', () => {
    const ios = verdictOf('flutter-mobile', 'build:flutter-ios:prod')
    expect(ios?.blockedBy).toBe('platform-unsupported')
    expect(ios?.missing).toEqual(['macos'])
    // No PATH means no Flutter SDK, so the Android lane is blocked by tooling
    // rather than by the platform — a different reason the menu must word
    // differently.
    for (const command of family('flutter-mobile')?.build ?? []) {
      if (command.script.includes('android')) {
        expect([command.script, command.blockedBy]).toEqual([command.script, 'toolchain-missing'])
        expect(command.missing).toContain('flutter')
      }
    }
  })

  it('catches the mini-program lane whose entry file is not in the tree', () => {
    expect(scripts('mini-program', 'build').length).toBeGreaterThan(0)
    for (const command of family('mini-program')?.build ?? []) {
      expect([command.script, command.blockedBy]).toEqual([command.script, 'entry-missing'])
      expect(command.missing).toEqual(['scripts/build-mini-program.mjs'])
    }
  })
})
