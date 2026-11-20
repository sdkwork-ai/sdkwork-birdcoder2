/**
 * SDKWork application formats the access-token initializer can write.
 *
 * `APP_ACCESS_TOKEN_SPEC.md` §2 fixes one profile file per application format;
 * the runtime target the token claims comes from the surface's own runtime.
 * The table here is that mapping, plus the framework hints the application
 * manifest exposes, so the dialog can preselect the format and the operator can
 * override it when a root follows a non-default delivery.
 */
import type { RuntimeTarget } from './accessToken.ts'
import { joinHostPath } from './paths.ts'

/** The profile-file format of one application root. */
export type ApplicationFormat = 'dotenv' | 'json' | 'harmony-json'

/** One selectable application type. */
export interface ApplicationType {
  /** Stable id used by the dialog and the API types. */
  id: ApplicationTypeId
  /** Profile-file carrier and the merge strategy the initializer applies. */
  format: ApplicationFormat
  /** Runtime target written when the operator does not pick another. */
  defaultRuntimeTarget: RuntimeTarget
  /** Runtime targets this application type can declare. */
  runtimeTargets: readonly RuntimeTarget[]
  /**
   * Relative profile-file segments under the application root.
   * @param profileId - `<deployment-profile>.<environment>`.
   * @returns path segments; the last one is the file name.
   */
  profileFile(profileId: string): readonly string[]
}

/** Ids of the application formats the token matrix serves. */
export type ApplicationTypeId = 'vite' | 'flutter' | 'mini-program' | 'harmony-native' | 'json-runtime'

/** Application-type table, one row per profile-file carrier. */
export const APPLICATION_TYPES: readonly ApplicationType[] = [
  {
    id: 'vite',
    format: 'dotenv',
    defaultRuntimeTarget: 'browser',
    runtimeTargets: ['browser', 'desktop', 'tablet-ipados', 'tablet-android'],
    profileFile: profileId => [`.env.${profileId}`],
  },
  {
    id: 'flutter',
    format: 'json',
    defaultRuntimeTarget: 'flutter-android',
    runtimeTargets: ['flutter-android', 'flutter-ios'],
    profileFile: profileId => ['env', `sdkwork.${profileId}.json`],
  },
  {
    id: 'mini-program',
    format: 'json',
    defaultRuntimeTarget: 'mini-program',
    runtimeTargets: ['mini-program'],
    profileFile: profileId => ['config', 'mini-program', `runtime-env.${profileId}.json`],
  },
  {
    id: 'harmony-native',
    format: 'harmony-json',
    defaultRuntimeTarget: 'harmony-native',
    runtimeTargets: ['harmony-native'],
    profileFile: profileId => ['config', 'app', `runtime-env.${profileId}.json`],
  },
  {
    id: 'json-runtime',
    format: 'json',
    defaultRuntimeTarget: 'android-native',
    runtimeTargets: [
      'android-native', 'ios-native', 'capacitor-android', 'capacitor-ios', 'tablet-android', 'tablet-ipados',
    ],
    profileFile: profileId => ['config', 'app', `runtime-env.${profileId}.json`],
  },
]

/**
 * Resolve one application type by id.
 * @param id - application type id.
 * @returns the table row, or undefined for an unknown id.
 */
export function applicationTypeById(id: ApplicationTypeId): ApplicationType | undefined {
  return APPLICATION_TYPES.find(type => type.id === id)
}

/**
 * Absolute Host path of one profile file.
 * @param appRoot - absolute application-root path.
 * @param type - the root's application type.
 * @param profileId - `<deployment-profile>.<environment>`.
 * @returns the profile file's absolute Host path.
 */
export function profileFilePath(appRoot: string, type: ApplicationType, profileId: string): string {
  return joinHostPath(appRoot, ...type.profileFile(profileId))
}

/** File markers read from the application root before choosing a type. */
export interface ApplicationTypeHints {
  /** Root manifest `app.appType` (`APP_REACT`, `APP_FLUTTER`, `APP_HARMONY`, `APP_UNIAPP`, ...). */
  manifestAppType?: string | undefined
  /** Root manifest `runtime.framework` (`flutter`, `harmony-native`, `react-tauri`, ...). */
  manifestFramework?: string | undefined
  /** Root manifest `runtime.family` (`web`, `mobile`, `desktop`, `mini-program`, ...). */
  manifestFamily?: string | undefined
  /** The root carries `pubspec.yaml`. */
  hasPubspec?: boolean | undefined
  /** The root carries a WeChat mini-program `project.config.json`. */
  hasMiniProgramProject?: boolean | undefined
  /** The root carries HarmonyOS `build-profile.json5` / `oh-package.json5`. */
  hasHarmonyProject?: boolean | undefined
  /** The root carries a Native Android/iOS/React Native workspace. */
  hasNativeMobileProject?: boolean | undefined
  /** The root carries `vite.config.ts` / `index.html`. */
  hasViteProject?: boolean | undefined
}

/** Manifest `app.appType` values that name a Vite-built web root. */
const VITE_APP_TYPES = new Set(['APP_REACT', 'APP_VUE', 'APP_HTML'])

/** Manifest `runtime.framework` values that name a Vite-built web root. */
const VITE_FRAMEWORKS = new Set(['react', 'react-h5', 'react-tauri', 'react-electron', 'electron', 'vue', 'html', 'wujie'])

/**
 * Choose the application type of one root.
 *
 * The manifest is authoritative when it names a known framework or app type;
 * file markers resolve the remaining cases (a Vite root with no manifest hint,
 * a mini-program surfaced as `APP_UNIAPP`). The dialog still lets the operator
 * override the result.
 * @param hints - manifest fields and file markers observed in the root.
 * @returns the resolved application type id.
 */
export function inferApplicationTypeId(hints: ApplicationTypeHints): ApplicationTypeId {
  const appType = (hints.manifestAppType ?? '').trim().toUpperCase()
  const framework = (hints.manifestFramework ?? '').trim().toLowerCase()
  const family = (hints.manifestFamily ?? '').trim().toLowerCase()

  if (appType === 'APP_FLUTTER' || framework === 'flutter' || hints.hasPubspec === true) return 'flutter'
  if (appType === 'APP_HARMONY' || framework === 'harmony-native' || hints.hasHarmonyProject === true) {
    return 'harmony-native'
  }
  if (framework === 'weixin-mini-program' || framework === 'mini-program'
    || hints.hasMiniProgramProject === true) {
    return 'mini-program'
  }
  // uni-app delivers to a mini program or to a Vite-built H5/mobile shell; its
  // mini-program family is the carrier the token matrix lists separately.
  if (framework === 'uni-app' || framework === 'uni-app-x' || appType === 'APP_UNIAPP') {
    return family === 'mini-program' ? 'mini-program' : 'vite'
  }
  if (appType === 'APP_UNITY' || framework === 'android-native'
    || framework === 'ios-native' || framework === 'react-native' || framework === 'capacitor') {
    return 'json-runtime'
  }
  if (appType === 'APP_ANDROID' || appType === 'APP_IOS') return 'json-runtime'
  if (hints.hasNativeMobileProject === true) return 'json-runtime'
  if (VITE_APP_TYPES.has(appType) || VITE_FRAMEWORKS.has(framework) || hints.hasViteProject === true) return 'vite'
  return 'vite'
}
