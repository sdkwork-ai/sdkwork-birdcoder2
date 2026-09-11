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
  readonly files: readonly string[]
  readonly extraResources: readonly [
    { readonly from: string, readonly to: 'runtime' },
    { readonly from: string, readonly to: 'dsh' },
    { readonly from: string, readonly to: 'dsh/node_modules' },
  ]
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
