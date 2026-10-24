/**
 * Complete app-manifest authoring for app creation (APP_MANIFEST_SPEC v3).
 *
 * The console's read-modify-write discipline (§4.1) keeps every existing
 * manifest section untouched; what this module adds is the other half of the
 * same clause: when the target project records no manifest at all, creation
 * writes a complete manifest instead of a linkage-only stub — the identity,
 * runtime, and publish sections every type card can fill truthfully, plus the
 * canonical `metadata.deploymentConfig` pointer and the initial release
 * entry. Fields the creation flow cannot know (official website, screenshots,
 * the package matrix) stay absent for the app repo's authoring pass to fill;
 * nothing is fabricated.
 *
 * The runtime identity per type mirrors the spec's §6.1 client-architecture
 * alignment table, keyed first by the console type card and then by the
 * `deploy_app` kind, so every creation path — manifest-derived or full form —
 * lands spec vocabulary, and reading the written manifest back resolves the
 * same card again (`projectAppCardId` round trip).
 */
import {
  mergeDeployLink,
  type DeployAppConfigLink,
  type DeployLinkWriteOptions,
} from './deployAppConfig.ts'

/** The spec-aligned runtime identity one app type composes into the manifest. */
export interface AppTypeRuntimeIdentity {
  /** `runtime.family` (canonical family vocabulary, spec §6). */
  readonly family: string
  /** `runtime.framework` (descriptive, spec §6 examples). */
  readonly framework: string
  /** `publish.platforms` (backend `PlusPlatform` values, spec §5). */
  readonly platforms: readonly string[]
  /** `app.appType` (backend `PlusProjectType` value, spec §4). */
  readonly appType: string
}

/** Console type card → spec runtime identity (covers the full card vocabulary). */
const CARD_RUNTIME_IDENTITIES: Readonly<Record<string, AppTypeRuntimeIdentity>> = {
  'h5': { family: 'mobile', framework: 'react-h5', platforms: ['H5'], appType: 'APP_REACT' },
  'uniapp-h5': { family: 'web', framework: 'uni-app', platforms: ['H5'], appType: 'APP_UNIAPP' },
  'pc-web': { family: 'web', framework: 'react', platforms: ['WEB'], appType: 'APP_REACT' },
  'desktop': { family: 'desktop', framework: 'electron', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  'desktop-electron': { family: 'desktop', framework: 'electron', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  'desktop-tauri': { family: 'desktop', framework: 'react-tauri', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  'desktop-qt': { family: 'desktop', framework: 'qt', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  'desktop-flutter': { family: 'desktop', framework: 'flutter', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_FLUTTER' },
  'mini-program': { family: 'mini-program', framework: 'weixin-mini-program', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  'wechat-mini-program': { family: 'mini-program', framework: 'weixin-mini-program', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  'douyin-mini-program': { family: 'mini-program', framework: 'multi-mini-program', platforms: ['MP_TOUTIAO'], appType: 'APP_UNIAPP' },
  'taro-wechat-mini-program': { family: 'mini-program', framework: 'uni-app', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  'uniapp-wechat-mini-program': { family: 'mini-program', framework: 'uni-app', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  'android': { family: 'mobile', framework: 'android-native', platforms: ['APP_ANDROID'], appType: 'NONE' },
  'native-android': { family: 'mobile', framework: 'android-native', platforms: ['APP_ANDROID'], appType: 'NONE' },
  'flutter-android': { family: 'mobile', framework: 'flutter', platforms: ['APP_ANDROID'], appType: 'APP_FLUTTER' },
  'react-native-android': { family: 'mobile', framework: 'android-native', platforms: ['APP_ANDROID'], appType: 'NONE' },
  'uniapp-android': { family: 'mobile', framework: 'uni-app', platforms: ['APP_ANDROID'], appType: 'APP_UNIAPP' },
  'ios': { family: 'mobile', framework: 'ios-native', platforms: ['APP_IOS'], appType: 'NONE' },
  'native-ios': { family: 'mobile', framework: 'ios-native', platforms: ['APP_IOS'], appType: 'NONE' },
  'flutter-ios': { family: 'mobile', framework: 'flutter', platforms: ['APP_IOS'], appType: 'APP_FLUTTER' },
  'react-native-ios': { family: 'mobile', framework: 'ios-native', platforms: ['APP_IOS'], appType: 'NONE' },
  'uniapp-ios': { family: 'mobile', framework: 'uni-app', platforms: ['APP_IOS'], appType: 'APP_UNIAPP' },
  'harmonyos': { family: 'mobile', framework: 'harmony-native', platforms: ['APP_HARMONY'], appType: 'APP_HARMONY' },
  'uniapp-harmonyos': { family: 'mobile', framework: 'uni-app', platforms: ['APP_HARMONY'], appType: 'APP_UNIAPP' },
  'api-service': { family: 'server', framework: 'node-service', platforms: ['API'], appType: 'NONE' },
  'api-service-rust': { family: 'server', framework: 'rust-service', platforms: ['API'], appType: 'NONE' },
  'api-service-node': { family: 'server', framework: 'node-service', platforms: ['API'], appType: 'NONE' },
  'api-service-go': { family: 'server', framework: 'go-service', platforms: ['API'], appType: 'NONE' },
  'api-service-java': { family: 'server', framework: 'spring-boot', platforms: ['API'], appType: 'NONE' },
  'api-service-python': { family: 'server', framework: 'python-service', platforms: ['API'], appType: 'NONE' },
  'static-web': { family: 'web', framework: 'static-html', platforms: ['WEB'], appType: 'APP_HTML' },
}

/** `deploy_app` kind → spec runtime identity, the fallback when only the created record is known. */
const KIND_RUNTIME_IDENTITIES: Readonly<Record<string, AppTypeRuntimeIdentity>> = {
  'SPA_WEB': { family: 'web', framework: 'react', platforms: ['WEB', 'H5'], appType: 'APP_REACT' },
  'DESKTOP_APP': { family: 'desktop', framework: 'electron', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  'WECHAT_MINIPROGRAM': { family: 'mini-program', framework: 'weixin-mini-program', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  'DOUYIN_MINIPROGRAM': { family: 'mini-program', framework: 'multi-mini-program', platforms: ['MP_TOUTIAO'], appType: 'APP_UNIAPP' },
  'ANDROID_APP': { family: 'mobile', framework: 'android-native', platforms: ['APP_ANDROID'], appType: 'NONE' },
  'IOS_APP': { family: 'mobile', framework: 'ios-native', platforms: ['APP_IOS'], appType: 'NONE' },
  'HARMONYOS_APP': { family: 'mobile', framework: 'harmony-native', platforms: ['APP_HARMONY'], appType: 'APP_HARMONY' },
  'API_SERVICE': { family: 'server', framework: 'node-service', platforms: ['API'], appType: 'NONE' },
  'STATIC_WEB': { family: 'web', framework: 'static-html', platforms: ['WEB'], appType: 'APP_HTML' },
}

/** What a created app contributes to the manifest's identity sections. */
export interface AppManifestIdentity {
  /** `app.name`, the stable registration name (the created record's name). */
  readonly name: string
  /** `app.displayName`; omitted falls back to {@link name}. */
  readonly displayName?: string
  /** `app.description`. */
  readonly description?: string
  /** `app.key` override (the manifest's own governed key). */
  readonly appKey?: string
  /** `app.key` fallback derived by the console when the name yields no kebab. */
  readonly appSlug?: string
  /** Console type card resolved for the app, when one is known. */
  readonly cardId?: string
  /** The created record's app kind, the identity fallback without a card. */
  readonly appKind?: string
  /** `app.officialWebsiteUrl`, only when the caller truthfully knows one. */
  readonly officialWebsiteUrl?: string
  /** Product icon URL, recorded as `app.iconUrl` and `media.icons.primary.url`. */
  readonly iconUrl?: string
}

/**
 * Compose the manifest text for a creation-time linkage write.
 *
 * An existing manifest (or any parsable text) is honored untouched: the patch
 * merges into it through {@link mergeDeployLink}, preserving every section —
 * the console's read-modify-write rule. Only a missing manifest composes the
 * full skeleton: identity and per-type runtime sections the creation flow
 * truthfully knows, the canonical deployment-config pointer, the initial
 * release entry, and the linkage patch merged in last.
 * @param raw - the current manifest text, or undefined when the file is absent.
 * @param patch - the linkage fields to record.
 * @param identity - what the created app contributes; omitted composes the
 *   bare canonical skeleton with the patch only.
 * @param options - the canonical deployment profile the linkage is recorded under.
 * @returns the manifest text to write.
 */
export function composeAppManifest(
  raw: string | undefined,
  patch: Partial<DeployAppConfigLink>,
  identity: AppManifestIdentity | undefined,
  options: DeployLinkWriteOptions,
): string {
  if (raw !== undefined && raw.trim() !== '') {
    try {
      JSON.parse(raw)
      return mergeDeployLink(raw, patch, options)
    } catch {
      // A damaged file is rebuilt as a complete manifest below (§4.1:
      // corrupted files are rebuilt rather than blocking publishing).
    }
  }
  const appKey = appKeyOf(identity)
  const runtime = runtimeIdentityOf(identity)
  const iconUrl = identity?.iconUrl
  const skeleton = {
    schemaVersion: 3,
    kind: 'sdkwork.app',
    app: {
      key: appKey,
      name: identity?.name ?? appKey,
      displayName: identity?.displayName ?? identity?.name ?? appKey,
      ...(identity?.description === undefined ? {} : { description: identity.description }),
      ...(identity?.officialWebsiteUrl === undefined ? {} : { officialWebsiteUrl: identity.officialWebsiteUrl }),
      ...(iconUrl === undefined ? {} : { iconUrl }),
      appType: runtime.appType,
    },
    backend: {},
    runtime: {
      family: runtime.family,
      framework: runtime.framework,
      supportedDeploymentProfiles: ['standalone'],
      defaultDeploymentProfile: 'standalone',
    },
    media: {
      icons: {
        primary: iconUrl === undefined ? {} : {
          id: `${appKey}-primary-icon`,
          type: 'ICON',
          purpose: 'PRIMARY',
          url: iconUrl,
        },
        platform: [],
      },
      screenshots: [],
      previews: [],
    },
    publish: {
      platforms: [...runtime.platforms],
    },
    artifacts: {
      installConfig: {
        packages: [],
      },
    },
    release: {
      latest: { STABLE: '0.1.0' },
      notes: [
        {
          version: '0.1.0',
          current: true,
          packageIds: [],
        },
      ],
    },
    security: {},
    metadata: {
      deploymentConfig: 'etc/sdkwork.deployment.config.json',
    },
  }
  return mergeDeployLink(JSON.stringify(skeleton, null, 2), patch, options)
}

/**
 * Resolve the runtime identity a creation writes: the type card's row first,
 * then the app kind's row, then the web fallback the schema requires.
 * @param identity - what the created app contributes.
 * @returns the family/framework/platforms/appType quadruple.
 */
export function runtimeIdentityOf(identity: AppManifestIdentity | undefined): AppTypeRuntimeIdentity {
  const cardId = identity?.cardId
  if (cardId !== undefined && Object.hasOwn(CARD_RUNTIME_IDENTITIES, cardId)) {
    return CARD_RUNTIME_IDENTITIES[cardId]
  }
  const appKind = identity?.appKind
  if (appKind !== undefined && Object.hasOwn(KIND_RUNTIME_IDENTITIES, appKind)) {
    return KIND_RUNTIME_IDENTITIES[appKind]
  }
  return KIND_RUNTIME_IDENTITIES['SPA_WEB']
}

/**
 * Derive the manifest's immutable `app.key`: the governed key when the
 * manifest (or draft) declares one, else the kebab derivation of the name,
 * else the console's derived slug, else the bare `app` token.
 * @param identity - what the created app contributes.
 * @returns a lower kebab-case key.
 */
export function appKeyOf(identity: AppManifestIdentity | undefined): string {
  const declared = identity?.appKey
  if (declared !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(declared)) return declared
  const derived = kebabOf(identity?.name)
  if (derived !== undefined) return derived
  const slug = identity?.appSlug
  if (slug !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return slug
  return 'app'
}

/** Lower kebab-case of a display name, or undefined when nothing ASCII survives. */
function kebabOf(name: string | undefined): string | undefined {
  const kebab = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(kebab) ? kebab : undefined
}
