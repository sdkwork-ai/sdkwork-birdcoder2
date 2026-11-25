/**
 * The `birdcoder-app-deploy` skill package: every reference it names exists,
 * its preflight script derives the type, build output and build command, its
 * standards resolver works without a `sdkwork-specs` checkout, and its selfcheck
 * catches a single-file installation.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeProject,
  BUILD_OUTPUT_CANDIDATES,
  deriveAppType,
  detectAdaptiveOutputs,
  detectBuildCommand,
  detectBuildOutput,
  manifestErrors,
} from '../assets/skills/birdcoder-app-deploy/scripts/preflight.mjs'
import {
  listBundled,
  resolveSpecPath,
  resolveStandards,
  type StandardsResolution,
} from '../assets/skills/birdcoder-app-deploy/scripts/standards.mjs'
import { selfCheck } from '../assets/skills/birdcoder-app-deploy/scripts/selfcheck.mjs'

/** Absolute skill directory. */
const SKILL_DIR = fileURLToPath(new URL('../assets/skills/birdcoder-app-deploy/', import.meta.url))

/** The analyzer's project directory in these fixtures. */
const PROJECT = resolve('D:/p')

/** Temporary directories to remove. */
const temporary: string[] = []
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** One fixture path under the project. */
function projectPath(...segments: string[]): string {
  return join(PROJECT, ...segments)
}

/** The in-memory filesystem face the analyzer consumes. */
function memoryIo(files: Record<string, string>, directories: readonly string[] = []): {
  readFile: (path: string) => Promise<string>
  listDir: (path: string) => Promise<string[]>
  stat: (path: string) => Promise<{ isDirectory(): boolean } | undefined>
} {
  const normalize = (value: string): string => value.replace(/\\/gu, '/')
  const normalized = new Map(Object.entries(files).map(([path, content]) => [normalize(path), content]))
  return {
    readFile: async (path) => {
      const content = normalized.get(normalize(path))
      if (content === undefined) throw new Error(`missing ${path}`)
      return content
    },
    listDir: async (path) => {
      const prefix = `${normalize(path)}/`
      const children = [...normalized.keys()]
        .filter(file => file.startsWith(prefix))
        .map(file => file.slice(prefix.length).split('/')[0]!)
      return [...new Set(children)].sort()
    },
    stat: async path => directories.some(directory => normalize(directory) === normalize(path))
      ? { isDirectory: () => true }
      : undefined,
  }
}

/** One complete governed manifest for a PC web app, as the preflight reads it. */
function manifestValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 3,
    kind: 'agent.app',
    app: { key: 'store', name: 'Store', displayName: 'Store', appType: 'APP_REACT', officialWebsiteUrl: 'https://example.com' },
    backend: {},
    runtime: { family: 'web', framework: 'react', supportedDeploymentProfiles: ['standalone', 'cloud'], defaultDeploymentProfile: 'cloud' },
    media: { icons: { primary: { url: 'https://cdn.example.com/icon.png' }, platform: [] }, screenshots: [], previews: [{ url: 'https://cdn.example.com/cover.png' }] },
    publish: { platforms: ['WEB'], config: { workspaceRoot: 'apps/store-pc' } },
    artifacts: { installConfig: { packages: [] } },
    release: { currentVersion: '1.2.0', notes: [{ version: '1.2.0', releaseChannel: 'STABLE', current: true, packageIds: [] }] },
    security: { checksumRequired: true },
    metadata: { deploymentConfig: 'etc/sdkwork.deployment.config.json' },
    ...overrides,
  }
}

/** The same manifest as the project file carries it. */
function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(manifestValue(overrides))
}

/** A valid project's in-memory files. */
function validFiles(): Record<string, string> {
  return {
    [projectPath('agent.app.config.json')]: manifest(),
    [projectPath('apps', 'store-pc', 'dist', 'index.html')]: '<html></html>',
    [projectPath('package.json')]: JSON.stringify({ scripts: { build: 'vite build' }, version: '2.0.0' }),
    [projectPath('pnpm-lock.yaml')]: 'lockfileVersion: 9',
  }
}

/** The bundled-source resolution these tests pin, so no real checkout is probed. */
const BUNDLED: StandardsResolution = { source: 'bundled', bundledDir: join(SKILL_DIR, 'references', 'standards') }

describe('birdcoder-app-deploy references', () => {
  it('names every reference and script file it ships', () => {
    const body = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')
    const references = [...body.matchAll(/\]\(((?:references|scripts|assets)\/[^)\s]+)\)/gu)].map(match => match[1]!)
    expect(references.length).toBeGreaterThanOrEqual(8)
    for (const reference of references) {
      expect(existsSync(join(SKILL_DIR, reference)), reference).toBe(true)
    }
    expect(existsSync(join(SKILL_DIR, 'references', 'standards', 'APP_MANIFEST_SPEC.md'))).toBe(true)
  })

  it('is complete as installed, and reports a single-file installation as incomplete', () => {
    expect(selfCheck()).toMatchObject({ ok: true, missing: [] })
    const directory = mkdtempSync(join(tmpdir(), 'deploy-skill-single-file-'))
    temporary.push(directory)
    writeFileSync(join(directory, 'SKILL.md'), 'See [a](references/a.md) and run [b](scripts/b.mjs).\n')
    mkdirSync(join(directory, 'references'))
    writeFileSync(join(directory, 'references', 'a.md'), 'a\n')
    writeFileSync(join(directory, 'skill.manifest.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', files: [{ path: 'scripts/b.mjs' }] }))
    const report = selfCheck(directory)
    expect(report.ok).toBe(false)
    expect(report.missing).toContain('scripts/b.mjs')
    expect(report.missing).not.toContain('references/a.md')
  })
})

describe('standards resolution', () => {
  it('prefers a checkout when one is named, and falls back to the bundled contract', () => {
    const checkout = mkdtempSync(join(tmpdir(), 'sdkwork-specs-checkout-'))
    temporary.push(checkout)
    writeFileSync(join(checkout, 'APP_MANIFEST_SPEC.md'), '# manifest\n')
    writeFileSync(join(checkout, 'PACKAGING_SPEC.md'), '# packaging\n')
    const resolved = resolveStandards({ SDKWORK_SPECS_HOME: checkout }, [], { ancestors: false })
    expect(resolved).toMatchObject({ source: 'checkout', checkoutDir: resolve(checkout) })
    const fallback = resolveStandards({ SDKWORK_SPECS_HOME: '' }, [], { ancestors: false })
    expect(fallback.source).toBe('bundled')
    expect(resolveSpecPath('APP_MANIFEST_SPEC.md', fallback)).toBe(join(SKILL_DIR, 'references', 'standards', 'APP_MANIFEST_SPEC.md'))
    expect(resolveSpecPath('NOT_A_SPEC.md', fallback)).toBeUndefined()
  })

  it('ships the six bundled contracts', () => {
    expect(listBundled()).toEqual([
      'APPLICATION_DEPLOY_LAYOUT_SPEC.md',
      'APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md',
      'APP_MANIFEST_SPEC.md',
      'ENVIRONMENT_SPEC.md',
      'PACKAGING_SPEC.md',
      'SDKWORK_DEPLOY_SPEC.md',
    ])
  })
})

describe('preflight type derivation', () => {
  it('maps the web, mobile, mini-program, desktop and server forms', () => {
    expect(deriveAppType(manifestValue()).cardId).toBe('pc-web')
    expect(deriveAppType(manifestValue({
      runtime: { family: 'web', framework: 'static-html', supportedDeploymentProfiles: ['standalone'], defaultDeploymentProfile: 'standalone' },
    })).cardId).toBe('static-web')
    expect(deriveAppType(manifestValue({
      publish: { platforms: ['H5'], config: { workspaceRoot: 'apps/store-pc' } },
    })).cardId).toBe('h5')
    expect(deriveAppType(manifestValue({
      app: { key: 'store', name: 'Store', displayName: 'Store', appType: 'APP_FLUTTER', officialWebsiteUrl: 'https://example.com' },
      runtime: { family: 'mobile', framework: 'flutter', supportedDeploymentProfiles: ['standalone'], defaultDeploymentProfile: 'standalone' },
      publish: { platforms: ['APP_ANDROID'], config: { workspaceRoot: 'apps/store-mobile' } },
    })).cardId).toBe('android')
    expect(deriveAppType(manifestValue({
      app: { key: 'store', name: 'Store', displayName: 'Store', appType: 'APP_UNIAPP', officialWebsiteUrl: 'https://example.com' },
      runtime: { family: 'mini-program', framework: 'uni-app', supportedDeploymentProfiles: ['standalone'], defaultDeploymentProfile: 'standalone' },
      publish: { platforms: ['MP_WEIXIN'] },
    })).cardId).toBe('mini-program')
    expect(deriveAppType(manifestValue({
      runtime: { family: 'desktop', framework: 'electron', supportedDeploymentProfiles: ['standalone'], defaultDeploymentProfile: 'standalone' },
    })).cardId).toBe('desktop')
    expect(deriveAppType(manifestValue({
      runtime: { family: 'server', framework: 'node', supportedDeploymentProfiles: ['cloud'], defaultDeploymentProfile: 'cloud' },
    })).cardId).toBe('api-service')
  })
})

describe('preflight manifest validation', () => {
  it('accepts the complete manifest and rejects missing sections', () => {
    expect(manifestErrors(manifestValue())).toEqual([])
    expect(manifestErrors(manifestValue({ security: undefined })))
      .toContainEqual(expect.stringContaining('MANIFEST_SECTIONS'))
    expect(manifestErrors(manifestValue({ metadata: {} })))
      .toContainEqual(expect.stringContaining('MANIFEST_DEPLOYMENT_POINTER'))
  })

  it('rejects an invalid key, family and deployment profile', () => {
    const errors = manifestErrors(manifestValue({
      app: { key: 'Bad Key', name: 'Store', displayName: 'Store', appType: 'APP_REACT', officialWebsiteUrl: 'https://example.com' },
      runtime: { family: 'unknown', framework: '', supportedDeploymentProfiles: [], defaultDeploymentProfile: 'cloud' },
    }))
    expect(errors).toContainEqual(expect.stringContaining('app.key'))
    expect(errors).toContainEqual(expect.stringContaining('runtime.family'))
    expect(errors).toContainEqual(expect.stringContaining('supportedDeploymentProfiles'))
  })
})

describe('preflight build resolution', () => {
  it('finds the first conventional output directory', () => {
    expect(detectBuildOutput('/p', ['dist', 'build'])).toEqual({ outputDir: join('/p', 'dist'), exists: true })
    expect(detectBuildOutput('/p', ['src'])).toBeUndefined()
    expect(BUILD_OUTPUT_CANDIDATES[0]).toBe('dist')
  })

  it('reports the project build script for the package manager', () => {
    expect(detectBuildCommand({ runtime: { framework: 'react' } }, { scripts: { build: 'vite build', 'build:prod': 'vite build --mode production' } }, 'pnpm'))
      .toEqual(['pnpm run build:prod', 'pnpm run build'])
    expect(detectBuildCommand({ runtime: { framework: 'flutter' } }, undefined, 'pnpm')[0]).toBe('flutter build web')
  })

  it('finds adaptive-web profile/environment outputs', async () => {
    const io = memoryIo({
      [projectPath('dist', 'standalone', 'prod', 'index.html')]: '<html></html>',
      [projectPath('dist', 'cloud', 'test', 'index.html')]: '<html></html>',
    })
    expect(await detectAdaptiveOutputs(projectPath(), io.listDir)).toEqual(['dist/cloud/test', 'dist/standalone/prod'])
    expect(await detectAdaptiveOutputs(projectPath('missing'), io.listDir)).toEqual([])
  })
})

describe('preflight project analysis', () => {
  it('reports a missing manifest', async () => {
    const report = await analyzeProject(PROJECT, memoryIo({}))
    expect(report).toMatchObject({ ok: false, error: 'MANIFEST_MISSING' })
  })

  it('reports unparsable and non-object manifests', async () => {
    expect(await analyzeProject(PROJECT, memoryIo({ [projectPath('agent.app.config.json')]: '{oops' })))
      .toMatchObject({ ok: false, error: 'MANIFEST_INVALID_JSON' })
    expect(await analyzeProject(PROJECT, memoryIo({ [projectPath('agent.app.config.json')]: '[]' })))
      .toMatchObject({ ok: false, error: 'MANIFEST_NOT_OBJECT' })
  })

  it('reports an actionable project with the bundled standards source', async () => {
    const report = await analyzeProject(PROJECT, memoryIo(validFiles()), { standards: BUNDLED })
    expect(report.ok).toBe(true)
    expect(report).toMatchObject({
      identity: { cardId: 'pc-web', key: 'store' },
      build: { outputExists: true, packageManager: 'pnpm', commands: ['pnpm run build'] },
      release: { version: '1.2.0' },
      standards: { source: 'bundled' },
    })
    expect(report.errors).toEqual([])
  })

  it('reports a missing official-website field', async () => {
    const files = validFiles()
    files[projectPath('agent.app.config.json')] = manifest({
      app: { key: 'store', name: 'Store', displayName: 'Store', appType: 'APP_REACT' },
    })
    const report = await analyzeProject(PROJECT, memoryIo(files), { standards: BUNDLED })
    expect(report.ok).toBe(false)
    expect(report.errors).toContainEqual(expect.stringContaining('app.officialWebsiteUrl'))
  })

  it('accepts an explicit output directory and rejects a missing one', async () => {
    const files = { [projectPath('agent.app.config.json')]: manifest() }
    const accepted = await analyzeProject(
      PROJECT,
      memoryIo(files, [projectPath('apps', 'store-pc', 'dist')]),
      { buildOutput: 'apps/store-pc/dist', standards: BUNDLED },
    )
    expect(accepted.ok).toBe(true)
    const rejected = await analyzeProject(PROJECT, memoryIo(files), { buildOutput: 'missing', standards: BUNDLED })
    expect(rejected.ok).toBe(false)
    expect(rejected.errors).toContainEqual(expect.stringContaining('BUILD_OUTPUT_MISSING'))
  })

  it('refuses an ambiguous adaptive-web output', async () => {
    const files: Record<string, string> = {
      [projectPath('agent.app.config.json')]: manifest(),
      [projectPath('apps', 'store-pc', 'dist', 'standalone', 'prod', 'index.html')]: '<html></html>',
    }
    const ambiguous = await analyzeProject(PROJECT, memoryIo(files), { standards: BUNDLED })
    expect(ambiguous.ok).toBe(false)
    expect(ambiguous.errors).toContainEqual(expect.stringContaining('BUILD_OUTPUT_AMBIGUOUS'))
    expect(ambiguous.build).toMatchObject({ adaptiveCandidates: ['dist/standalone/prod'] })
    const explicit = await analyzeProject(PROJECT, memoryIo(files, [projectPath('apps', 'store-pc', 'dist', 'standalone', 'prod')]), {
      buildOutput: 'apps/store-pc/dist/standalone/prod',
      standards: BUNDLED,
    })
    expect(explicit.ok).toBe(true)
  })
})
