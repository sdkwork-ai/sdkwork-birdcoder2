#!/usr/bin/env node
/**
 * Offline preflight for one SDKWork application project.
 *
 * Reads the governed manifest, validates its required shape, derives the
 * application family and console card, resolves the build output (including the
 * adaptive PC+H5 `dist/<profile>/<env>/` layout), and reports the build command
 * the project itself declares. When a `sdkwork-specs` checkout is reachable it
 * also runs the official manifest checker; otherwise the skill's bundled
 * distilled contract is authoritative. No network call, no credential.
 *
 * Usage:
 *   node scripts/preflight.mjs <project-directory> [--build-output <relative-path>]
 */

import { spawnSync } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveStandards } from './standards.mjs'

/** Manifest file this preflight reads (APP_MANIFEST_SPEC). */
export const MANIFEST_FILE = 'agent.app.config.json'

/** Conventional build output directories, most specific first. */
export const BUILD_OUTPUT_CANDIDATES = ['dist', 'build', 'out', '.output', 'public']

/** Top-level sections the manifest validator requires. */
export const REQUIRED_SECTIONS = ['app', 'backend', 'runtime', 'media', 'publish', 'artifacts', 'release', 'security']

/** Runtime families `APP_MANIFEST_SPEC.md` §6 accepts. */
const RUNTIME_FAMILIES = new Set(['web', 'mobile', 'desktop', 'server', 'cli', 'mini-program', 'library', 'plugin'])

/** Lockfile → package manager, in detection order. */
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

/**
 * Derive the application family and the console type card the manifest
 * describes. An ambiguous root resolves to no card instead of a guess.
 * @param {Record<string, unknown>} manifest parsed manifest.
 * @returns {{ cardId?: string, family?: string, framework?: string, platforms: string[] }}
 */
export function deriveAppType(manifest) {
  const app = record(manifest['app']) ?? {}
  const runtime = record(manifest['runtime']) ?? {}
  const publish = record(manifest['publish']) ?? {}
  const family = text(runtime['family'])
  const framework = text(runtime['framework'])
  const appType = text(app['appType'])
  const platforms = Array.isArray(publish['platforms']) ? publish['platforms'].filter(value => typeof value === 'string') : []
  const cardId = cardOf({ family, framework, appType, platforms })
  return {
    ...(family === undefined ? {} : { family }),
    ...(framework === undefined ? {} : { framework }),
    platforms,
    ...(cardId === undefined ? {} : { cardId }),
  }
}

/** The card id for one derived identity, following the app plugin's mapping. */
function cardOf(identity) {
  const { family, framework, platforms } = identity
  const appType = identity.appType
  if (family === 'server') return 'api-service'
  if (appType === 'APP_HARMONY' || framework === 'harmony-native') return 'harmonyos'
  if (family === 'mini-program' || (appType === 'APP_UNIAPP' && platforms.some(isMiniProgram))) return 'mini-program'
  if (family === 'desktop') return 'desktop'
  if (family === 'mobile' || appType === 'APP_FLUTTER') return mobileCard(framework, platforms)
  if (family === 'web' || appType === 'APP_REACT' || appType === 'APP_VUE' || appType === 'APP_HTML') {
    if (framework === 'static-html') return 'static-web'
    if (platforms.includes('H5') && !platforms.includes('WEB')) return 'h5'
    return 'pc-web'
  }
  return undefined
}

/** The mobile card one declared platform or native framework names. */
function mobileCard(framework, platforms) {
  if (framework === 'android-native') return 'android'
  if (framework === 'ios-native') return 'ios'
  if (framework === 'react-h5' || framework === 'react-capacitor') return 'h5'
  const android = platforms.includes('APP_ANDROID')
  const ios = platforms.includes('APP_IOS')
  if (android !== ios) return android ? 'android' : 'ios'
  if (!android && !ios && platforms.includes('H5')) return 'h5'
  return undefined
}

/** True for the backend `MP_*` mini-program platform family. */
function isMiniProgram(platform) {
  return platform === 'MP' || platform.startsWith('MP_')
}

/**
 * Resolve the source root the manifest declares.
 * @param {Record<string, unknown>} manifest parsed manifest.
 * @param {string} directory project directory.
 * @returns {string} absolute source root, or the project directory.
 */
export function sourceRoot(manifest, directory) {
  const publish = record(manifest['publish']) ?? {}
  const config = record(publish['config']) ?? record(manifest['config']) ?? {}
  const raw = text(config['workspaceRoot'])
  if (raw === undefined) return directory
  const relative = raw.replace(/\\/gu, '/').replace(/^\.\/+/u, '').replace(/\/+$/u, '')
  if (relative === '' || relative === '.') return directory
  if (relative.startsWith('/') || /^[A-Za-z]:/u.test(relative)) return directory
  const segments = relative.split('/').filter(segment => segment !== '' && segment !== '.')
  if (segments.length === 0 || segments.some(segment => segment === '..')) return directory
  return join(directory, ...segments)
}

/**
 * Find the conventional build output to publish.
 * @param {string} root absolute source root.
 * @param {readonly string[]} entries names directly under the root.
 * @returns {{ outputDir: string, exists: boolean } | undefined}
 */
export function detectBuildOutput(root, entries) {
  const found = BUILD_OUTPUT_CANDIDATES.find(name => entries.includes(name))
  return found === undefined ? undefined : { outputDir: join(root, found), exists: true }
}

/**
 * Find the adaptive-web profile/environment output directories under `dist`.
 * @param {string} root absolute source root.
 * @param {(path: string) => Promise<string[]>} listDir directory lister.
 * @returns {Promise<string[]>} relative candidates like `dist/standalone/prod`.
 */
export async function detectAdaptiveOutputs(root, listDir) {
  const distDir = join(root, 'dist')
  let profiles
  try {
    profiles = (await listDir(distDir)).filter(name => name === 'standalone' || name === 'cloud')
  } catch {
    return []
  }
  const candidates = []
  for (const profile of profiles) {
    let environments
    try {
      environments = (await listDir(join(distDir, profile))).filter(name => ['dev', 'test', 'staging', 'prod'].includes(name))
    } catch {
      continue
    }
    for (const environment of environments) candidates.push(`dist/${profile}/${environment}`)
  }
  return candidates
}

/**
 * Read the build command the project itself declares.
 * @param {Record<string, unknown> | undefined} manifest parsed manifest.
 * @param {Record<string, unknown> | undefined} packageManifest project `package.json`, when one exists.
 * @param {string} packageManager detected package manager.
 * @returns {string[]} candidate commands, most specific first.
 */
export function detectBuildCommand(manifest, packageManifest, packageManager) {
  const runtime = record(manifest?.['runtime']) ?? {}
  const framework = text(runtime['framework'])
  if (framework === 'flutter') return ['flutter build web', 'flutter build apk --release', 'flutter build ios --release']
  const scripts = record(packageManifest?.['scripts']) ?? {}
  const names = Object.keys(scripts)
  const preferred = ['build:prod', 'build:production', 'build', 'package', 'release', 'bundle']
  const chosen = preferred.filter(name => names.includes(name))
  const runner = packageManager === 'npm' ? 'npm run' : `${packageManager} run`
  return chosen.map(name => `${runner} ${name}`)
}

/**
 * Validate the manifest's required shape against the bundled contract.
 * @param {Record<string, unknown>} manifest parsed manifest.
 * @returns {string[]} hard errors.
 */
export function manifestErrors(manifest) {
  const errors = []
  const missing = REQUIRED_SECTIONS.filter(section => record(manifest[section]) === undefined && !Array.isArray(manifest[section]))
  if (missing.length > 0) errors.push(`MANIFEST_SECTIONS: missing ${missing.join(', ')}`)
  const metadata = record(manifest['metadata']) ?? {}
  const hasDeploymentPointer = manifest['environments'] !== undefined
    || text(metadata['deploymentConfig']) !== undefined
  if (!hasDeploymentPointer) errors.push('MANIFEST_DEPLOYMENT_POINTER: environments or metadata.deploymentConfig is required')
  const app = record(manifest['app']) ?? {}
  for (const [field, label] of [['key', 'app.key'], ['name', 'app.name'], ['displayName', 'app.displayName'], ['officialWebsiteUrl', 'app.officialWebsiteUrl'], ['appType', 'app.appType']]) {
    if (text(app[field]) === undefined) errors.push(`MANIFEST_FIELD: ${label} is required`)
  }
  const key = text(app['key'])
  if (key !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key)) errors.push('MANIFEST_FIELD: app.key must be lower kebab-case')
  const runtime = record(manifest['runtime']) ?? {}
  const family = text(runtime['family'])
  if (family === undefined || !RUNTIME_FAMILIES.has(family)) errors.push(`MANIFEST_FIELD: runtime.family must be one of ${[...RUNTIME_FAMILIES].join(', ')}`)
  if (text(runtime['framework']) === undefined) errors.push('MANIFEST_FIELD: runtime.framework is required')
  const profiles = Array.isArray(runtime['supportedDeploymentProfiles']) ? runtime['supportedDeploymentProfiles'] : []
  if (profiles.length === 0 || profiles.some(profile => profile !== 'standalone' && profile !== 'cloud')) {
    errors.push('MANIFEST_FIELD: runtime.supportedDeploymentProfiles must be a non-empty subset of standalone|cloud')
  }
  const defaultProfile = text(runtime['defaultDeploymentProfile'])
  if (defaultProfile === undefined || !profiles.includes(defaultProfile)) {
    errors.push('MANIFEST_FIELD: runtime.defaultDeploymentProfile must be one of supportedDeploymentProfiles')
  }
  return errors
}

/**
 * Analyze one project with an injected filesystem face, so the rules are
 * testable without a checkout.
 * @param {string} directory project directory.
 * @param {{ readFile: (path: string) => Promise<string>, listDir: (path: string) => Promise<string[]>, stat: (path: string) => Promise<{ isDirectory: () => boolean } | undefined> }} io filesystem face.
 * @param {{ buildOutput?: string, standards?: ReturnType<typeof resolveStandards>, runStandardCheck?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>>} the preflight report.
 */
export async function analyzeProject(directory, io, options = {}) {
  const manifestPath = join(directory, MANIFEST_FILE)
  let raw
  try {
    raw = await io.readFile(manifestPath)
  } catch {
    return { ok: false, error: 'MANIFEST_MISSING', manifest: manifestPath, errors: ['MANIFEST_MISSING'] }
  }
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'MANIFEST_INVALID_JSON', manifest: manifestPath, errors: ['MANIFEST_INVALID_JSON'] }
  }
  if (record(manifest) === undefined) {
    return { ok: false, error: 'MANIFEST_NOT_OBJECT', manifest: manifestPath, errors: ['MANIFEST_NOT_OBJECT'] }
  }
  const errors = manifestErrors(manifest)
  const warnings = []
  if (manifest['schemaVersion'] !== 3) errors.push('MANIFEST_SCHEMA_VERSION: expected schemaVersion 3 (APP_MANIFEST_SPEC)')
  if (manifest['kind'] !== 'agent.app') errors.push('MANIFEST_KIND: expected kind "agent.app"')
  const type = deriveAppType(manifest)
  if (type.cardId === undefined) errors.push('APP_TYPE_AMBIGUOUS: the manifest does not resolve to one console card')
  const root = sourceRoot(manifest, directory)
  let entries = []
  try {
    entries = await io.listDir(root)
  } catch {
    warnings.push(`SOURCE_ROOT_UNREADABLE: ${root}`)
  }
  const adaptive = await detectAdaptiveOutputs(root, io.listDir)
  let output
  if (options.buildOutput !== undefined) {
    output = await explicitBuildOutput(directory, options.buildOutput, io)
  } else if (adaptive.length > 0) {
    errors.push('BUILD_OUTPUT_AMBIGUOUS: adaptive web output; pass --build-output dist/<profile>/<env>')
  } else {
    output = detectBuildOutput(root, entries)
  }
  if (output === undefined && adaptive.length === 0 && options.buildOutput === undefined) {
    errors.push('BUILD_OUTPUT_MISSING: no dist/, build/, out/, .output/ or public/ directory; build the app or pass --build-output')
  }
  if (output === undefined && options.buildOutput !== undefined) {
    errors.push(`BUILD_OUTPUT_MISSING: ${options.buildOutput} does not exist under the project`)
  }
  let packageManifest
  try {
    packageManifest = JSON.parse(await io.readFile(join(directory, 'package.json')))
  } catch {
    packageManifest = undefined
  }
  let packageManager = 'pnpm'
  for (const [lockfile, name] of LOCKFILES) {
    try {
      await io.readFile(join(directory, lockfile))
      packageManager = name
      break
    } catch {
      // Absent lockfile; keep the previous candidate.
    }
  }
  const commands = detectBuildCommand(manifest, record(packageManifest), packageManager)
  if (commands.length === 0) warnings.push('BUILD_COMMAND_UNKNOWN: no build script in package.json; name the project\'s own build command')
  const release = record(manifest['release']) ?? {}
  const version = text(release['currentVersion']) ?? text(record(packageManifest)?.['version'])
  const standards = options.standards ?? resolveStandards()
  const standardCheck = options.runStandardCheck === true && standards.source === 'checkout'
    ? runOfficialCheck(standards.checkoutDir, directory)
    : undefined
  if (standardCheck?.ok === false) errors.push('STANDARD_CHECK_FAILED: the official manifest checker rejected this project')
  return {
    ok: errors.length === 0,
    project: { directory, manifest: manifestPath, sourceRoot: root },
    identity: {
      key: text(record(manifest['app'])?.['key']),
      name: text(record(manifest['app'])?.['name']),
      displayName: text(record(manifest['app'])?.['displayName']) ?? text(record(manifest['app'])?.['name']),
      appType: text(record(manifest['app'])?.['appType']),
      ...type,
    },
    build: {
      ...(output === undefined ? {} : { outputDir: output.outputDir }),
      outputExists: output?.exists === true,
      ...(adaptive.length === 0 ? {} : { adaptiveCandidates: adaptive }),
      packageManager,
      commands,
    },
    release: version === undefined ? {} : { version },
    standards: {
      source: standards.source,
      ...(standards.checkoutDir === undefined ? {} : { checkoutDir: standards.checkoutDir }),
    },
    ...(standardCheck === undefined ? {} : { standardCheck }),
    warnings,
    errors,
  }
}

/** Validate one explicitly requested build output, relative to the project. */
async function explicitBuildOutput(directory, relative, io) {
  const explicit = join(directory, relative)
  const info = await io.stat(explicit)
  return info?.isDirectory() === true ? { outputDir: explicit, exists: true } : undefined
}

/** Run the official manifest checker when a checkout carries it. */
function runOfficialCheck(checkoutDir, directory) {
  if (checkoutDir === undefined) return undefined
  const checker = join(checkoutDir, 'tools', 'check-app-manifest-standard.mjs')
  const result = spawnSync(process.execPath, [checker, '--root', directory], { encoding: 'utf8' })
  if (result.error !== undefined) return { ran: false, ok: undefined, error: String(result.error.message) }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n')
  return { ran: true, ok: result.status === 0, ...(output === '' ? {} : { output }) }
}

/**
 * Run the preflight from the command line.
 * @param {string[]} argv arguments after the script path.
 * @returns {Promise<number>} the process exit code.
 */
export async function main(argv) {
  const directory = argv[0]
  if (directory === undefined) {
    process.stderr.write('usage: node scripts/preflight.mjs <project-directory> [--build-output <relative-path>]\n')
    return 2
  }
  const flag = argv.indexOf('--build-output')
  const buildOutput = flag === -1 ? undefined : argv[flag + 1]
  const report = await analyzeProject(directory, {
    readFile: path => readFile(path, 'utf8'),
    listDir: async path => (await readdir(path)).sort(),
    stat: async path => {
      try {
        return await stat(path)
      } catch {
        return undefined
      }
    },
  }, {
    ...(buildOutput === undefined ? {} : { buildOutput }),
    runStandardCheck: true,
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return report.ok === true ? 0 : 1
}

/** Narrow a value to a plain record. */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/** Read a non-empty trimmed string member. */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/* v8 ignore next 3 -- only the CLI entry runs main(); tests import the analysis functions. */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
