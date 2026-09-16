/** Electron-builder fields asserted by the Desktop release tests. */
export interface DesktopElectronBuilderConfig {
  readonly appId: string
  readonly productName: string
  /** Plain executable name; the scoped package name cannot become a safe one. */
  readonly executableName: string
  /**
   * The release contract's asset spelling. `assemble-github-release.ts` asserts
   * these exact names, with electron-builder's per-format arch token.
   */
  readonly artifactName: string
  readonly directories: {
    readonly output: string
    readonly buildResources: string
  }
  /**
   * Five leading literal entries, then the two host-tree mappings; the fork adds
   * the packaged window raster the upstream shape does not carry.
   */
  readonly files: readonly [
    string,
    string,
    string,
    string,
    string,
    { readonly from: string, readonly to: 'dsh', readonly filter: readonly ['**/*'] },
    { readonly from: string, readonly to: 'dsh/node_modules', readonly filter: readonly ['**/*'] },
  ]
  readonly asarUnpack: readonly string[]
  /** The unpacked host tree beside the app; `files` carries the asar entries. */
  readonly extraResources: readonly [{ readonly from: string, readonly to: 'runtime' }]
  readonly mac: {
    readonly icon: string
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
 * @returns electron-builder configuration.
 */
export function createElectronBuilderConfig(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopElectronBuilderConfig

declare const electronBuilderConfig: DesktopElectronBuilderConfig

export default electronBuilderConfig
