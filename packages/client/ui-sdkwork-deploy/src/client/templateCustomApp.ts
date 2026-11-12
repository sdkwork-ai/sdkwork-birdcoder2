/**
 * Detect the publishable identity and application type of one arbitrary
 * directory — an app root that is not under the project's `apps/` tree.
 *
 * The project scan owns the governed `apps/README.md` contract; this module
 * owns the pick-anything case. A directory may still carry
 * `agent.app.config.json`, in which case that manifest wins. Otherwise the
 * files are inspected through the Host listing/batch-read bridge: project
 * markers (Flutter, React Native, Android, iOS, HarmonyOS, mini-program,
 * Electron/Tauri, web frameworks, static HTML, server frameworks) propose a
 * type, and the UI lets the operator override that proposal manually.
 *
 * Detection only reads a handful of small marker files; the archive itself is
 * packed later by the same local zip packer used for `apps/` roots.
 */
import { DEPLOY_APP_CONFIG_FILE } from './deployAppConfig.ts'
import { templateAppCandidateFromManifest, type TemplateAppCandidate } from './templateApps.ts'
import { templateAppTypeOption, type TemplateAppTypeOption } from './templateAppTypes.ts'
import { TEMPLATE_PLATFORM_OPTIONS } from './templatePlatforms.ts'

/** The bounded Host bridge the detector consumes. */
export interface CustomTemplateAppPort {
  listFiles(directory: string): Promise<{
    readonly files: readonly { readonly path: string; readonly size: number }[]
    readonly truncated: boolean
  } | undefined>
  readFiles(directory: string, paths: readonly string[]): Promise<readonly {
    readonly path: string
    readonly contentBase64: string
    readonly bytes: number
  }[] | undefined>
}

/** Why a picked directory cannot even be inspected. */
export type CustomTemplateDirectoryFailure = 'unreadable' | 'empty'

/** A directory the detector refused to turn into a candidate. */
export class CustomTemplateDirectoryError extends Error {
  readonly failure: CustomTemplateDirectoryFailure

  constructor(failure: CustomTemplateDirectoryFailure, message: string) {
    super(message)
    this.name = 'CustomTemplateDirectoryError'
    this.failure = failure
  }
}

/** One detected application type. */
export interface DetectedTemplateAppType {
  /** The type select value. */
  readonly typeId: string
  /** Console card id, when the type has one. */
  readonly cardId?: string
  /** Template platform ids for this type. */
  readonly platforms: readonly string[]
  /** Files/dependencies that produced the guess. */
  readonly signals: readonly string[]
}

/** The inspection result the custom-directory card renders. */
export interface CustomTemplateAppInspection {
  readonly candidate: TemplateAppCandidate
  /** Packaging-eligible files the Host listing reported. */
  readonly fileCount: number
  /** The Host cut the listing at its bound; packing will refuse it. */
  readonly truncated: boolean
  /** A governed manifest was read and accepted. */
  readonly hasManifest: boolean
  /** A manifest exists but could not be parsed. */
  readonly manifestInvalid: boolean
  /** At least one detection read failed; inference used file names only. */
  readonly readFailed: boolean
  /** Marker files/dependencies behind the type guess. */
  readonly signals: readonly string[]
}

/** Files whose contents can name or identify the project. */
const MARKER_FILES: readonly string[] = [
  DEPLOY_APP_CONFIG_FILE,
  'package.json',
  'pubspec.yaml',
  'app.json',
  'project.config.json',
  'capacitor.config.json',
  'capacitor.config.ts',
  'tauri.conf.json',
  'oh-package.json5',
  'module.json5',
  'hvigorfile.ts',
  'index.html',
]

/** Maximum marker files read in one Host batch. */
const MAX_MARKER_READS = 16

/** Parsed `package.json` facts. */
export interface PackageFacts {
  readonly name?: string
  readonly version?: string
  readonly description?: string
  readonly displayName?: string
  readonly dependencies: ReadonlySet<string>
  readonly scripts: string
}

/** Parsed `pubspec.yaml` facts (flat scalar fields only). */
interface PubspecFacts {
  readonly name?: string
  readonly version?: string
  readonly description?: string
}

/**
 * Inspect one picked directory into a publishable candidate.
 * @param port - the Host listing and batch-read bridge.
 * @param directory - absolute directory the operator picked.
 * @returns the candidate plus the detection facts the UI reports.
 * @throws CustomTemplateDirectoryError when the directory is unreadable/empty.
 */
export async function inspectCustomTemplateApp(
  port: CustomTemplateAppPort,
  directory: string,
): Promise<CustomTemplateAppInspection> {
  const listing = await port.listFiles(directory)
  if (listing === undefined) {
    throw new CustomTemplateDirectoryError('unreadable', `cannot read "${directory}"`)
  }
  if (listing.files.length === 0) {
    throw new CustomTemplateDirectoryError('empty', `the directory "${directory}" has no files`)
  }
  const paths = listing.files.map(file => file.path)
  const lowerPaths = paths.map(path => path.toLowerCase())
  const pathByLower = new Map(lowerPaths.map((path, index) => [path, paths[index]]))
  const markerPaths: string[] = []
  for (const marker of MARKER_FILES) {
    const path = pathByLower.get(marker.toLowerCase())
    if (path !== undefined) markerPaths.push(path)
  }
  const manifestPath = pathByLower.get(DEPLOY_APP_CONFIG_FILE.toLowerCase())
  let contents: ReadonlyMap<string, string> = new Map()
  let readFailed = false
  if (markerPaths.length > 0) {
    try {
      const read = await port.readFiles(directory, markerPaths.slice(0, MAX_MARKER_READS))
      if (read === undefined) readFailed = true
      else {
        contents = new Map(read.map(file => [file.path.toLowerCase(), decodeText(file.contentBase64)]))
      }
    } catch {
      readFailed = true
    }
  }
  const manifestRaw = manifestPath === undefined ? undefined : contents.get(manifestPath.toLowerCase())
  const packageFacts = parsePackageFacts(contents.get('package.json'))
  const pubspecFacts = parsePubspec(contents.get('pubspec.yaml'))
  const directoryName = basenameOf(directory)
  const packageVersion = packageFacts?.version ?? pubspecFacts?.version
  if (manifestRaw !== undefined) {
    const fromManifest = templateAppCandidateFromManifest({
      directory,
      directoryName,
      raw: manifestRaw,
      projectRoot: false,
      packageVersion,
      source: 'custom',
    })
    if (fromManifest !== undefined) {
      return {
        candidate: fromManifest,
        fileCount: listing.files.length,
        truncated: listing.truncated,
        hasManifest: true,
        manifestInvalid: false,
        readFailed,
        signals: [DEPLOY_APP_CONFIG_FILE],
      }
    }
  }
  const detected = detectTemplateAppType({
    filePaths: paths,
    packageFacts,
  })
  const appKey = sanitizeCustomAppKey(
    packageFacts?.name?.split('/').at(-1) ?? pubspecFacts?.name ?? directoryName,
  )
  const name = firstNonEmpty(
    packageFacts?.displayName,
    packageFacts?.name?.split('/').at(-1),
    pubspecFacts?.name,
    directoryName,
  ) ?? directoryName
  const description = firstNonEmpty(packageFacts?.description, pubspecFacts?.description)
  const candidate: TemplateAppCandidate = {
    directory,
    directoryName,
    appKey,
    name,
    ...(description === undefined ? {} : { description }),
    ...(packageVersion === undefined ? {} : { version: packageVersion }),
    ...(detected?.cardId === undefined ? {} : { cardId: detected.cardId }),
    platforms: detected?.platforms ?? [],
    manifestRaw: '',
    projectRoot: false,
    source: 'custom',
    ...(detected === undefined ? {} : { appTypeId: detected.typeId }),
    typeSource: detected === undefined ? 'none' : 'detected',
  }
  return {
    candidate,
    fileCount: listing.files.length,
    truncated: listing.truncated,
    hasManifest: false,
    manifestInvalid: manifestRaw !== undefined,
    readFailed,
    signals: detected?.signals ?? [],
  }
}

/**
 * Detect an application type from project markers.
 * @param input - every relative path plus parsed package facts.
 * @returns the detected type, or undefined when nothing is conclusive.
 */
export function detectTemplateAppType(input: {
  readonly filePaths: readonly string[]
  readonly packageFacts?: PackageFacts | undefined
}): DetectedTemplateAppType | undefined {
  const paths = input.filePaths.map(path => path.toLowerCase())
  const has = (path: string): boolean => paths.includes(path.toLowerCase())
  const hasUnder = (prefix: string): boolean => paths.some(path => path.startsWith(`${prefix.toLowerCase()}/`))
  const hasSuffix = (suffix: string): boolean => paths.some(path => path.endsWith(suffix.toLowerCase()))
  const deps = input.packageFacts?.dependencies ?? new Set<string>()
  const scripts = input.packageFacts?.scripts.toLowerCase() ?? ''
  const options = {
    h5: templateAppTypeOption('h5'),
    desktop: templateAppTypeOption('desktop'),
    mini: templateAppTypeOption('mini-program'),
    android: templateAppTypeOption('android'),
    ios: templateAppTypeOption('ios'),
    harmony: templateAppTypeOption('harmonyos'),
    staticWeb: templateAppTypeOption('static-web'),
    api: templateAppTypeOption('api-service'),
  }
  // React Native/Expo must win over the generic "app.json" mini-program
  // marker: an Expo project also has an app.json and an App entry file.
  if (deps.has('react-native') || deps.has('expo')) {
    return {
      typeId: 'mobile',
      platforms: ['ANDROID', 'IOS'],
      signals: [deps.has('expo') ? 'expo' : 'react-native'],
    }
  }
  if (has('project.config.json')
    || (((has('app.js') || has('app.ts')) && has('app.json')) && hasUnder('pages'))
    || deps.has('@tarojs/taro') || deps.has('miniprogram-api-typings') || scripts.includes('weapp')) {
    return optionType(options.mini, ['project.config.json/app.json'])
  }
  if (has('pubspec.yaml') || has('lib/main.dart')) {
    const platforms = new Set<string>()
    if (hasUnder('android')) platforms.add('ANDROID')
    if (hasUnder('ohos')) platforms.add('HARMONY')
    if (hasUnder('ios')) platforms.add('IOS')
    if (hasUnder('web')) platforms.add('H5')
    if (hasUnder('windows') || hasUnder('macos') || hasUnder('linux')) platforms.add('DESKTOP')
    const ordered = TEMPLATE_PLATFORM_OPTIONS
      .map(platform => platform.id)
      .filter(id => platforms.has(id))
    return {
      typeId: 'flutter',
      platforms: ordered.length > 0 ? ordered : ['ANDROID', 'IOS'],
      signals: ['pubspec.yaml'],
    }
  }
  if (has('oh-package.json5') || has('module.json5') || has('hvigorfile.ts')) {
    return optionType(options.harmony, ['oh-package.json5/module.json5'])
  }
  const gradleSettings = has('settings.gradle') || has('settings.gradle.kts')
  const gradleBuild = hasSuffix('build.gradle') || hasSuffix('build.gradle.kts')
  if (hasSuffix('androidmanifest.xml') || (gradleSettings && gradleBuild)) {
    return optionType(options.android, ['AndroidManifest.xml/settings.gradle'])
  }
  if (hasSuffix('.xcodeproj/project.pbxproj') || hasSuffix('.xcworkspace/contents.xcworkspacedata')
    || has('package.swift')) {
    return optionType(options.ios, ['Xcode project/Package.swift'])
  }
  if (deps.has('electron') || deps.has('tauri') || deps.has('@tauri-apps/api')
    || hasSuffix('tauri.conf.json') || hasSuffix('electron-builder.yml')
    || hasSuffix('electron-builder.json')) {
    return optionType(options.desktop, ['electron/tauri'])
  }
  if (deps.has('react') || deps.has('vue') || deps.has('svelte') || deps.has('@angular/core')
    || deps.has('next') || deps.has('nuxt') || deps.has('vite')
    || hasSuffix('vite.config.ts') || hasSuffix('vite.config.js')
    || hasSuffix('next.config.js') || hasSuffix('next.config.mjs')
    || hasSuffix('nuxt.config.ts') || has('angular.json')) {
    return optionType(options.h5, ['web framework'])
  }
  if (has('index.html')) {
    return optionType(options.staticWeb, ['index.html'])
  }
  if (deps.has('express') || deps.has('koa') || deps.has('fastify')
    || deps.has('@nestjs/core') || deps.has('hono')) {
    return optionType(options.api, ['server framework'])
  }
  return undefined
}

/** Turn one option into a detected type with evidence. */
function optionType(option: TemplateAppTypeOption | undefined, signals: readonly string[]): DetectedTemplateAppType {
  /* v8 ignore next -- every call passes a static, existing option id. */
  if (option === undefined) throw new Error('unknown application type option')
  return {
    typeId: option.id,
    ...(option.cardId === undefined ? {} : { cardId: option.cardId }),
    platforms: option.platforms,
    signals,
  }
}

/** Parse the package.json facts detection needs. */
function parsePackageFacts(raw: string | undefined): PackageFacts | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const dependencies = new Set<string>()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const value = record[field]
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    for (const name of Object.keys(value)) dependencies.add(name.toLowerCase())
  }
  const scripts = typeof record.scripts === 'object' && record.scripts !== null
    ? Object.values(record.scripts as Record<string, unknown>)
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
    : ''
  const name = stringField(record.name)
  const version = stringField(record.version)
  const description = stringField(record.description)
  const displayName = stringField(record.displayName)
  return {
    ...(name === undefined ? {} : { name }),
    ...(version === undefined ? {} : { version }),
    ...(description === undefined ? {} : { description }),
    ...(displayName === undefined ? {} : { displayName }),
    dependencies,
    scripts,
  }
}

/** Parse the flat scalar fields of a pubspec. */
function parsePubspec(raw: string | undefined): PubspecFacts | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const value = (field: string): string | undefined => {
    const match = new RegExp(`^${field}:\\s*(.+)$`, 'mu').exec(raw)
    return match?.[1]?.trim().replace(/^['"]|['"]$/gu, '') || undefined
  }
  const name = value('name')
  const version = value('version')
  const description = value('description')
  if (name === undefined && version === undefined && description === undefined) return undefined
  return {
    ...(name === undefined ? {} : { name }),
    ...(version === undefined ? {} : { version }),
    ...(description === undefined ? {} : { description }),
  }
}

/** One optional trimmed string field from a parsed object. */
function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** A stable lower-kebab template key from a package/directory name. */
export function sanitizeCustomAppKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
    .replace(/-+$/u, '') || 'app'
}

/** Decode one base64 utf-8 text chunk. */
function decodeText(content: string): string {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

/** Last path segment of a directory. */
function basenameOf(directory: string): string {
  return directory.replace(/[/\\]+$/u, '').split(/[\\/]/u).filter(Boolean).at(-1) ?? directory
}

/** First non-empty string. */
function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}
