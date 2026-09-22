import type { AfterPackContext, BeforePackContext } from 'app-builder-lib'

/** Electron-builder fields asserted by the Desktop release tests. */
export interface DesktopElectronBuilderConfig {
  readonly appId: string
  readonly protocols: readonly [{ readonly name: 'DeepSeek Harness'; readonly schemes: readonly ['dsh'] }]
  readonly productName: string
  /** Plain executable name; the scoped package name cannot become a safe one. */
  readonly executableName: string
  /**
   * The release contract's asset spelling. `assemble-github-release.ts` asserts
   * these exact names, with electron-builder's per-format arch token.
   */
  readonly artifactName: string
  /** The qualification flow rewrites the packaged app identity through here. */
  readonly extraMetadata: { readonly dshDesktopAppId: string, readonly [key: string]: unknown }
  readonly directories: {
    readonly output: string
    readonly buildResources: string
  }
  /**
   * Leading literal entries (the fork adds the packaged window raster the
   * upstream shape does not carry), then the two host-tree mappings.
   */
  readonly files: readonly (
    | string
    | { readonly from: string, readonly to: string, readonly filter?: readonly string[] }
  )[]
  readonly asarUnpack: readonly string[]
  /** The unpacked host tree beside the app; `files` carries the asar entries. */
  readonly extraResources: readonly ({ readonly from: string, readonly to: string })[]
  readonly beforeBuild: () => Promise<boolean>
  readonly beforePack: (context: BeforePackContext) => Promise<void>
  readonly afterPack: (context: AfterPackContext) => Promise<void>
  readonly mac: {
    readonly icon: string
    readonly extendInfo: {
      readonly CFBundleLocalizations: readonly string[]
      readonly NSMicrophoneUsageDescription: string
    }
    readonly identity: string | undefined
    readonly forceCodeSigning: boolean
    readonly hardenedRuntime: boolean
    readonly notarize: boolean
    readonly signIgnore: readonly string[]
    readonly target: readonly string[]
  }
  readonly win: {
    readonly icon: string
    readonly forceCodeSigning: boolean
    readonly signtoolOptions: {
      readonly sign: ((path: string, options: { readonly hash: string, readonly isNest: boolean }) => Promise<void>) | undefined
      readonly publisherName: string | undefined
      readonly signingHashAlgorithms: readonly string[]
    }
    readonly target: readonly string[]
  }
  readonly linux: {
    readonly icon: string
    readonly synopsis: string
    readonly maintainer: string
    readonly vendor: string
    readonly target: readonly string[]
  }
  readonly deb: {
    readonly packageName: string
  }
  readonly rpm: {
    readonly packageName: string
  }
  readonly nsis: {
    readonly include: string
    readonly oneClick: boolean
    /**
     * `true` on the shipped lane: the installer targets every user of the
     * machine. `false` only under `DSH_DESKTOP_INSTALL_MODE=perUser`, which the
     * native installer checks use to install into a private directory without
     * elevation.
     */
    readonly perMachine: boolean
    /**
     * Always `false`: the branded welcome page owns the directory and writes it
     * back into `$INSTDIR`, so compiling in the stock `MUI_PAGE_DIRECTORY` would
     * ask for the same folder twice.
     */
    readonly allowToChangeInstallationDirectory: boolean
    readonly differentialPackage: boolean
    readonly useZip: boolean
    readonly installerIcon: string
    readonly uninstallerIcon: string
    readonly installerHeaderIcon: string
  }
  readonly dmg: {
    readonly sign: boolean
    readonly writeUpdateInfo: boolean
  }
  /**
   * Written only when a provider is configured, and the release assembly
   * requires all four `latest*.yml` channel files beside the installers.
   */
  readonly publish:
    | readonly [{ readonly provider: 'github', readonly owner: string, readonly repo: string }]
    | readonly [{ readonly provider: 'generic', readonly url: string }]
  readonly toolsets: {
    readonly appimage: string
  }
  /**
   * The darwin-only post-pack hook. It carries the signature check and nothing
   * else: the host tree now travels inside `app.asar`, so there is no runtime
   * tree beside the bundle for a post-pack step to read.
   */
  readonly afterSign: (context: {
    readonly electronPlatformName: string
    readonly appOutDir: string
    readonly packager: {
      readonly appInfo: { readonly productFilename: string, readonly version: string }
    }
  }) => Promise<void>
  readonly artifactBuildCompleted: (artifact: { readonly file: string }) => Promise<void> | undefined
}

/**
 * Create electron-builder configuration from one release environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no explicit target is present.
 * @param hostArch - Build-host architecture used when no explicit target is present.
 * @param preparedRuntime - Verified private qualification runtime; ordinary releases use target-owned resources.
 * @param preparedRuntimeVersion - Version that private runtime declares, which qualification rewrites away from the product version.
 * @returns electron-builder configuration.
 */
export function createElectronBuilderConfig(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
  preparedRuntime?: string,
  preparedRuntimeVersion?: string,
): DesktopElectronBuilderConfig

declare const electronBuilderConfig: DesktopElectronBuilderConfig

export default electronBuilderConfig
