/**
 * Project-side application facts derived from the governed app manifest
 * (`agent.app.config.json`, APP_MANIFEST_SPEC v3).
 *
 * Two questions drive the simplified publish entry:
 *
 * 1. Has this project already registered a deploy_app? The answer comes from
 *    the manifest alone —the canonical `metadata.publishing.appIdByTarget`
 *    map (plus the legacy slots `DeployAppConfigLink` still reads) —so the
 *    entry can hide "create" the moment a project owns an app.
 * 2. What should a created deploy_app be called and typed? The manifest's
 *    `app` section carries the governed identity (`app.key`, `app.name`,
 *    `app.displayName`, `app.description`, `app.appType`) and `runtime`
 *    carries the architecture; the create flow turns them into the draft the
 *    console's type cards expect instead of asking the user to retype them.
 *
 * Everything here is pure: the host adapter reads the file, these helpers
 * interpret it.
 */
import { parseDeployLink, type DeployAppConfigLink } from './deployAppConfig.ts'

/** Governed identity fields of the manifest's `app` section. */
export interface ProjectAppIdentity {
  /** Immutable application key (`app.key`, lower kebab-case). */
  readonly appKey?: string
  /** Canonical platform name (`app.name`), the deploy_app name fallback. */
  readonly appName?: string
  /** Display label (`app.displayName`), preferred over {@link appName}. */
  readonly displayName?: string
  /** Product description (`app.description`). */
  readonly description?: string
  /** Backend `PlusProjectType` value (`app.appType`). */
  readonly appType?: string
  /** `runtime.family` (web, mobile, desktop, server, mini-program, —. */
  readonly runtimeFamily?: string
  /** `runtime.framework` (react, flutter, electron, static-html, —. */
  readonly runtimeFramework?: string
  /** `publish.platforms` as declared (canonical `PlusPlatform` values). */
  readonly platforms: readonly string[]
  /** Product icon URL from `app.iconUrl` or `media.icons.primary.url`. */
  readonly iconUrl?: string
  /** Canonical public website (`app.officialWebsiteUrl`). */
  readonly officialWebsiteUrl?: string
}

/** One project's app-registration state, read from its manifest. */
export interface ProjectAppState {
  /** Project directory the manifest belongs to; undefined without a cwd. */
  readonly directory?: string
  /** True when a manifest file was found and parsed into an object. */
  readonly hasManifest: boolean
  /** Governed identity, when the manifest carries an `app` section. */
  readonly identity?: ProjectAppIdentity
  /** The deploy_app id any supported manifest location records. */
  readonly linkedAppId?: string
  /** Canonical target key the id was resolved for (`<mode>.<environment>`). */
  readonly profileId?: string
  /** The parsed linkage, including fork provenance (template identity, names). */
  readonly link?: DeployAppConfigLink
}

/** The create-form draft a project manifest supports. */
export interface ProjectAppDraft {
  /** Application name shown on the confirm surface and sent as `deploy_app.name`. */
  readonly name: string
  /** Console type-card id (`h5`, `pc-web`, `desktop`, —; undefined when ambiguous. */
  readonly cardId?: string
  /** Product description sent as `deploy_app.description`. */
  readonly description?: string
  /** Manifest `app.key`, recorded beside the linkage for cross-reference. */
  readonly appKey?: string
}

/** True when the project already owns a deploy_app (creation must be refused). */
export function hasProjectApp(state: ProjectAppState): boolean {
  return state.linkedAppId !== undefined
}

/**
 * Interpret a raw manifest text for the publish entry.
 * @param raw - raw `agent.app.config.json` text, or undefined when absent.
 * @param options - `directory` for reporting and the `profileId` used to pick
 *   the canonical `appIdByTarget` entry.
 * @returns the project's app state; a missing or broken manifest reads as an
 *   unlinked project with no identity, never an error.
 */
export function readProjectAppState(
  raw: string | undefined,
  options: { readonly directory?: string | undefined; readonly profileId?: string | undefined },
): ProjectAppState {
  const manifest = parseManifestObject(raw)
  if (manifest === undefined) {
    return { hasManifest: false, ...(options.directory === undefined ? {} : { directory: options.directory }) }
  }
  const link = parseDeployLink(raw, options.profileId)
  const identity = readIdentity(manifest)
  return {
    hasManifest: true,
    ...(options.directory === undefined ? {} : { directory: options.directory }),
    ...(options.profileId === undefined ? {} : { profileId: options.profileId }),
    ...(identity === undefined ? {} : { identity }),
    ...(link === undefined ? {} : { linkedAppId: link.appId, link }),
  }
}

/**
 * Build the creation draft for an unlinked project.
 * @param state - the project's app state.
 * @param fallbackName - name to use when the manifest carries none (the
 *   project directory's basename).
 * @returns the draft; `cardId` stays undefined when the manifest does not
 *   determine one surface, which routes the user to the full create form.
 */
export function projectAppDraft(state: ProjectAppState, fallbackName: string): ProjectAppDraft {
  const identity = state.identity
  const name = identity?.displayName ?? identity?.appName ?? fallbackName.trim()
  const cardId = projectAppCardId(identity)
  const description = identity?.description
  return {
    name,
    ...(cardId === undefined ? {} : { cardId }),
    ...(description === undefined ? {} : { description }),
    ...(identity?.appKey === undefined ? {} : { appKey: identity.appKey }),
  }
}

/**
 * Resolve the console type card a project manifest describes.
 *
 * The manifest vocabulary is broader than the console's nine cards, so an
 * ambiguous root (for example a Flutter app shipping both mobile platforms
 * without a per-platform surface root) resolves to undefined and the caller
 * falls back to the full create form rather than guessing a surface.
 * @param identity - the manifest identity, when one was read.
 * @returns the card id, or undefined when the manifest does not determine one.
 */
export function projectAppCardId(identity: ProjectAppIdentity | undefined): string | undefined {
  if (identity === undefined) return undefined
  const family = identity.runtimeFamily
  const framework = identity.runtimeFramework
  const platforms = identity.platforms
  if (family === 'server') return 'api-service'
  if (identity.appType === 'APP_HARMONY' || framework === 'harmony-native') return 'harmonyos'
  if (family === 'mini-program' || identity.appType === 'APP_UNIAPP' && platforms.some(isMiniProgramPlatform)) {
    return 'mini-program'
  }
  if (family === 'desktop') return 'desktop'
  if (family === 'mobile' || identity.appType === 'APP_FLUTTER') return mobileCard(framework, platforms)
  if (family === 'web' || identity.appType === 'APP_REACT' || identity.appType === 'APP_VUE' || identity.appType === 'APP_HTML') {
    if (framework === 'static-html') return 'static-web'
    if (platforms.includes('H5') && !platforms.includes('WEB')) return 'h5'
    return 'pc-web'
  }
  return undefined
}

/**
 * Mobile root: a single declared app platform (or a native framework) decides.
 * An H5/Capacitor root reads as the h5 card, the spec's mobile-family H5
 * alignment (APP_MANIFEST_SPEC §6.1), and an H5-only platform list does the
 * same when neither store platform is declared.
 */
function mobileCard(framework: string | undefined, platforms: readonly string[]): string | undefined {
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
function isMiniProgramPlatform(platform: string): boolean {
  return platform === 'MP' || platform.startsWith('MP_')
}

/** Read the identity block out of a parsed manifest, omitting absent fields. */
function readIdentity(manifest: Record<string, unknown>): ProjectAppIdentity | undefined {
  const app = asRecord(manifest['app'])
  if (app === undefined) return undefined
  const runtime = asRecord(manifest['runtime'])
  const publish = asRecord(manifest['publish'])
  const media = asRecord(manifest['media'])
  const primaryIcon = asRecord(asRecord(media?.['icons'])?.['primary'])
  const appKey = stringValue(app['key'])
  const appName = stringValue(app['name'])
  const displayName = stringValue(app['displayName'])
  const description = stringValue(app['description'])
  const appType = stringValue(app['appType'])
  const runtimeFamily = stringValue(runtime?.['family'])
  const runtimeFramework = stringValue(runtime?.['framework'])
  const iconUrl = stringValue(app['iconUrl']) ?? stringValue(primaryIcon?.['url'])
  const officialWebsiteUrl = stringValue(app['officialWebsiteUrl'])
  return {
    platforms: readPlatforms(publish?.['platforms']),
    ...(appKey === undefined ? {} : { appKey }),
    ...(appName === undefined ? {} : { appName }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(description === undefined ? {} : { description }),
    ...(appType === undefined ? {} : { appType }),
    ...(runtimeFamily === undefined ? {} : { runtimeFamily }),
    ...(runtimeFramework === undefined ? {} : { runtimeFramework }),
    ...(iconUrl === undefined ? {} : { iconUrl }),
    ...(officialWebsiteUrl === undefined ? {} : { officialWebsiteUrl }),
  }
}

/** Parse a manifest text into its object form, tolerating absence and damage. */
function parseManifestObject(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return asRecord(parsed)
}

/** Narrow a value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Read a non-empty trimmed string member. */
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Read the declared platform list as strings. */
function readPlatforms(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}
