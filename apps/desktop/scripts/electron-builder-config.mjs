import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  resolveDesktopAppId,
  resolveMacOSNotarizationEnvironment,
  resolveMacOSSigningEnvironment,
} from './desktop-release-environment.mjs'
import { notarizeMacOSDiskImageArtifact } from './notarize-macos-disk-images.mjs'
import { verifyMacOSSignatureAfterSign } from './verify-macos-signature.mjs'
import {
  createWindowsTokenSigner,
  installWindowsNsisBootstrapSigner,
  resolveWindowsUpdatePublisher,
  scrubWindowsSigningEnvironment,
} from './windows-sign.mjs'
import { resolveDesktopAutoUpdateConfig } from './desktop-auto-update-environment.mjs'
import { resolveDesktopPolicyEnvironment } from './desktop-policy-environment.mjs'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { installWindowsDirectoryInstaller } from './windows-directory-installer.mjs'
import { preserveWindowsRuntimeSignature } from './windows-runtime-signature.mjs'
import {
  resolveMacOSAppUpdateFeed,
  verifyMacOSAppUpdateConfig,
  writeMacOSAppUpdateConfig,
} from './macos-app-update-config.mjs'

/**
 * The fork's GitHub Release repository.
 *
 * electron-builder writes the updater metadata (`latest.yml` and its per-platform
 * siblings) only when a publish provider is configured, and the release contract
 * requires those files beside the installers. Packaging always runs with
 * `--publish never`, so the provider is never contacted during packaging.
 */
const GITHUB_RELEASE_OWNER = 'sdkwork-ai'
const GITHUB_RELEASE_REPO = 'sdkwork-birdcoder2'

/**
 * Write the NSIS wrapper include that binds `INSTALLER_BUILD_DIR` to this run's
 * target directory, bridges the arch-specific unpacked-size define, and then
 * includes the repo-owned installer script.
 *
 * Two upstream-shaped assumptions break on non-x64 Windows targets, and both are
 * repaired here rather than by patching upstream-owned files (AGENTS.md forbids
 * patching them; a generated wrapper is fork-owned and survives every merge):
 *
 * 1. `installer.nsh` declares `!define /ifndef INSTALLER_BUILD_DIR` with a
 *    `targets\win-x64` fallback that is only correct for the x64 Windows target.
 *    The wrapper lets the resolved per-target path win, so win-arm64 reads its
 *    own `installer-ui` directory. `__FILEDIR__` inside the repo script still
 *    resolves to this wrapper's directory, so `INSTALLER_SOURCE_DIR` continues
 *    to work.
 *
 * 2. `installer/path.nsh:160` (upstream-owned, never touched by this fork)
 *    reads `${APP_64_UNPACKED_SIZE}` unguarded inside a disk-space `IntOp`.
 *    electron-builder only defines the arch-suffixed variants it actually built
 *    — an arm64 build receives `APP_ARM64_UNPACKED_SIZE` and no
 *    `APP_64_UNPACKED_SIZE` at all. NSIS then emits `warning 6000: unknown
 *    variable/constant` and electron-builder passes `-WX`
 *    (`warningsAsErrors` defaults to true), so makensis aborts:
 *    `Error: warning treated as error`. Upstream is unaffected only because its
 *    own CI builds x64 alone; the fork's six-target matrix exposes it. The
 *    bridge aliases the built variant into the name the script reads, keeping
 *    the upstream disk-space preflight meaningful on every arch.
 *
 * @param {string} targetRoot - Absolute `.desktop-build/targets/<target>` directory.
 * @returns {string} Absolute path of the generated wrapper include.
 */
function writeWindowsInstallerInclude(targetRoot) {
  const directory = join(targetRoot, 'installer-ui')
  mkdirSync(directory, { recursive: true })
  const include = join(directory, 'installer-include.nsh')
  writeFileSync(include,
    `!define INSTALLER_BUILD_DIR "${join(targetRoot, 'installer-ui')}"\n`
    + '; Bridge the arch-suffixed unpacked size into the name path.nsh reads.\n'
    + '!ifndef APP_64_UNPACKED_SIZE\n'
    + '  !ifdef APP_ARM64_UNPACKED_SIZE\n'
    + '    !define APP_64_UNPACKED_SIZE ${APP_ARM64_UNPACKED_SIZE}\n'
    + '  !else\n'
    + '    !define APP_64_UNPACKED_SIZE 0\n'
    + '  !endif\n'
    + '!endif\n'
    + `!include "${fileURLToPath(new URL('./installer.nsh', import.meta.url))}"\n`)
  return include
}

/**
 * Create electron-builder configuration from one release environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no explicit target is present.
 * @param {string} hostArch - Build-host architecture used when no explicit target is present.
 * @param {string | undefined} preparedRuntime - Verified private dsh tree for installed-update qualification; ordinary releases use the target tree.
 * @returns {object} electron-builder configuration.
 * FORK DIVERGENCE: the fork ships the BirdCoder brand (name, icons, artifact
 * spelling), packages six targets including unsigned macOS/Linux release lanes,
 * and publishes the updater metadata against the fork's GitHub repository.
 */
export function createElectronBuilderConfig(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
  preparedRuntime = undefined,
) {
  // FORK DIVERGENCE: shipped BirdCoder brand icons, one per packaged platform,
  // generated from the canonical `apps/web/public/favicon.png` raster by
  // scripts/generate-icons.mjs; packaging fails loudly if a merge dropped one.
  const brandIcon = relativePath => {
    if (!existsSync(join(APP_ROOT, relativePath))) {
      throw new Error(`desktop icons: ${relativePath} is missing; run pnpm --dir apps/desktop run generate-icons`)
    }
    return relativePath
  }
  const icons = {
    mac: brandIcon('build/icon.icns'),
    win: brandIcon('build/icon.ico'),
    linux: brandIcon('build/icon.png'),
  }
  const windowIcon = brandIcon('build/icon.png')
  const appId = resolveDesktopAppId(env)
  const policy = resolveDesktopPolicyEnvironment(env)
  const targetPlatform = env.DSH_DESKTOP_TARGET_PLATFORM
  const resolvedPlatform = targetPlatform ?? hostPlatform
  const resolvedArch = env.DSH_DESKTOP_TARGET_ARCH ?? hostArch
  if (env.DSH_DESKTOP_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_UNSIGNED must be 0 or 1')
  }
  const unsigned = env.DSH_DESKTOP_UNSIGNED === '1'
  // FORK DIVERGENCE (upstream gates unsigned builds to Windows): the fork builds
  // its GitHub Release lane unsigned on every platform — no signing identity
  // or COS credential — so every macOS, Windows, and Linux artifact ships unsigned.
  const packagesMacOS = targetPlatform === 'darwin' || (targetPlatform === undefined && hostPlatform === 'darwin')
  const packagesWindows = resolvedPlatform === 'win32'
  if (resolvedPlatform === 'win32') installWindowsDirectoryInstaller()
  const macOSSigning = packagesMacOS && !unsigned ? resolveMacOSSigningEnvironment(env) : undefined
  if (packagesMacOS && !unsigned) resolveMacOSNotarizationEnvironment(env)
  const buildPaths = desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch))
  let primaryRuntimeDestination
  const windowsSigner = packagesWindows && !unsigned
    ? createWindowsTokenSigner({
        certificateFile: env.DSH_DESKTOP_WINDOWS_CER_FILE,
        signTool: env.DSH_DESKTOP_WINDOWS_SIGNTOOL,
        tokenPin: env.DSH_DESKTOP_WINDOWS_TOKEN_PIN,
        keyContainer: env.DSH_DESKTOP_WINDOWS_KEY_CONTAINER,
        preserveSignature: async path => primaryRuntimeDestination === undefined ? false : preserveWindowsRuntimeSignature(path, {
          sourceRoot: join(buildPaths.runtime, 'primary-runtime'),
          destinationRoot: primaryRuntimeDestination,
          runDirectory: env.DSH_DESKTOP_PACKAGING_RUN_DIR,
        }),
      })
    : undefined
  if (windowsSigner !== undefined) {
    installWindowsNsisBootstrapSigner({ sign: windowsSigner })
  }
  const update = unsigned ? undefined : resolveDesktopAutoUpdateConfig(env, resolvedPlatform, resolvedArch)
  if (preparedRuntime !== undefined) buildPaths.dsh = preparedRuntime
  // FORK DIVERGENCE (upstream relies on `installer.nsh`'s own fallback, which
  // spells the win-x64 target directory): `beforeBuild` below compiles the
  // installer's native helper into `join(buildPaths.root, 'installer-ui')`, one
  // directory per release target, but `installer.nsh` resolves its
  // `INSTALLER_BUILD_DIR` fallback from `${__FILEDIR__}` — the repo-owned
  // scripts directory — with a hardcoded `targets\win-x64` segment. Every
  // Windows target therefore read the x64 directory, which works on win-x64 by
  // coincidence and fails on win-arm64 with `...\win-x64\installer-ui\
  // window-frame.dll -> no files found`. Hand NSIS the resolved per-target path
  // instead of letting it guess, exactly as `test-windows-installer.mjs` does.
  const nsisInclude = packagesWindows ? writeWindowsInstallerInclude(buildPaths.root) : undefined
  return {
    appId,
    extraMetadata: { dshDesktopAppId: appId, dshMandatoryUpdatePolicy: policy },
    // FORK DIVERGENCE: the BirdCoder mark, generated from the canonical product
    // raster by scripts/generate-icons.mjs; the scoped package name cannot become
    // a safe executable name, so pin a plain one for every platform's binary and
    // installer path, and spell artifacts the way the release contract's
    // exact-name assertion demands.
    productName: 'BirdCoder',
    executableName: 'birdcoder',
    artifactName: 'BirdCoder-${version}-${os}-${arch}.${ext}',
    directories: {
      output: unsigned ? join(buildPaths.root, 'unsigned-artifacts') : buildPaths.artifacts,
      buildResources: 'build',
    },
    asar: true,
    electronDist: buildPaths.electron,
    electronFuses: { runAsNode: true },
    beforeBuild: async () => {
      if (resolvedPlatform !== 'win32') return true
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        fileURLToPath(new URL('./prepare-windows-installer.ps1', import.meta.url)),
        '-OutputDirectory', join(buildPaths.root, 'installer-ui')], {
        env: scrubWindowsSigningEnvironment(env), windowsHide: true,
      })
      if (windowsSigner !== undefined) {
        await windowsSigner({ path: join(buildPaths.root, 'installer-ui', 'window-frame.dll'), hash: 'sha256', isNest: false })
      }
      // A falsy result tells electron-builder to omit its production node_modules collection.
      return true
    },
    files: [
      'lib/*.js',
      'lib/*.cjs',
      'renderer/**/*',
      windowIcon,
      'package.json',
      { from: buildPaths.dsh, to: 'dsh', filter: ['**/*'] },
      // electron-builder excludes a source directory's root node_modules.
      { from: join(buildPaths.dsh, 'node_modules'), to: 'dsh/node_modules', filter: ['**/*'] },
    ],
    asarUnpack: [
      '**/*.{node,dylib,dll,so,exe}',
      '**/*.so.*',
      '**/spawn-helper',
      '**/@vscode/ripgrep/bin/rg',
    ],
    extraResources: [
      { from: buildPaths.runtime, to: 'runtime' },
    ],
    mac: {
      icon: icons.mac,
      category: 'public.app-category.developer-tools',
      identity: macOSSigning?.signingIdentity,
      // Hardened runtime is a code-signing flag: with no identity to carry it,
      // asking for it only makes electron-builder complain.
      forceCodeSigning: !unsigned,
      hardenedRuntime: !unsigned,
      // ASAR-unpacked native runtime files are pre-signed; PAK resources are sealed by their enclosing bundle.
      signIgnore: ['/Contents/Resources/app\\.asar\\.unpacked/dsh(?:/|$)', '\\.pak$'],
      notarize: !unsigned,
      target: ['dmg', 'zip'],
    },
    dmg: {
      sign: !unsigned,
      // FORK DIVERGENCE (upstream suppresses it): `writeUpdateInfo: false` makes
      // dmg-builder skip `createBlockmap` entirely, so the release loses both the
      // `.dmg.blockmap` asset and the DMG's entry in `latest-mac.yml` — and
      // `scripts/release/assemble-github-release.ts` requires both for macOS.
      writeUpdateInfo: true,
    },
    beforePack: async context => {
      if (windowsSigner !== undefined) primaryRuntimeDestination = join(context.appOutDir, 'resources', 'runtime', 'primary-runtime')
      if (policy === undefined) return
      const { resolveDesktopPolicyConfig } = await import('../lib/types/mandatory-update-policy.js')
      resolveDesktopPolicyConfig(policy)
    },
    afterPack: async context => {
      const { verifyDesktopRuntime, writeDesktopRuntime } = await import('../lib/types/runtime-tree.js')
      const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
      if (resolvedPlatform === 'darwin' && update !== undefined) {
        await writeMacOSAppUpdateConfig(resourcesDir, resolveMacOSAppUpdateFeed(context.packager.config.publish),
          context.packager.appInfo.updaterCacheDirName)
      }
      if (resolvedPlatform === 'win32' && !unsigned) {
        // Windows signs copied executable resources before afterPack runs.
        const prepared = await verifyDesktopRuntime(buildPaths.dsh,
          context.packager.appInfo.version, { platform: resolvedPlatform, arch: resolvedArch })
        writeDesktopRuntime(buildPaths.dsh, prepared.release, prepared.sharedPackages.map(entry => entry.name),
          { platform: resolvedPlatform, arch: resolvedArch })
      }
      await verifyDesktopRuntime(buildPaths.dsh,
        context.packager.appInfo.version, { platform: resolvedPlatform, arch: resolvedArch })
    },
    afterSign: async context => {
      if (context.electronPlatformName !== 'darwin') return
      // An unsigned run carries no signature to verify, and resolving the signing
      // identity here would demand exactly the credentials the mode drops.
      if (unsigned) return
      const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
      if (update !== undefined) {
        await verifyMacOSAppUpdateConfig(appPath, resolveMacOSAppUpdateFeed(context.packager.config.publish),
          context.packager.appInfo.updaterCacheDirName)
      }
      verifyMacOSSignatureAfterSign(context, macOSSigning ?? resolveMacOSSigningEnvironment(env))
    },
    artifactBuildCompleted: artifact => {
      if (unsigned || !artifact.file.endsWith('.dmg')) return
      return notarizeMacOSDiskImageArtifact(
        artifact,
        env,
        macOSSigning ?? resolveMacOSSigningEnvironment(env),
      )
    },
    win: {
      icon: icons.win,
      forceCodeSigning: !unsigned,
      signtoolOptions: {
        sign: windowsSigner,
        publisherName: windowsSigner === undefined ? undefined : resolveWindowsUpdatePublisher(env.DSH_DESKTOP_WINDOWS_CER_FILE),
        signingHashAlgorithms: ['sha256'],
      },
      // FORK DIVERGENCE (upstream ships the NSIS installer alone): the release
      // contract publishes a portable ZIP beside it, on both architectures.
      target: ['nsis', 'zip'],
    },
    linux: {
      icon: icons.linux,
      category: 'Development',
      synopsis: 'Desktop agent harness',
      maintainer: 'SDKWork AI <support@sdkwork.com>',
      vendor: 'SDKWork AI',
      // FORK DIVERGENCE (upstream ships the AppImage alone): the release contract
      // publishes four formats per architecture, and AppImage, deb, and rpm are
      // the three that also carry updater metadata.
      target: ['AppImage', 'deb', 'rpm', 'tar.gz'],
    },
    deb: { packageName: 'birdcoder' },
    rpm: { packageName: 'birdcoder' },
    nsis: {
      installerSidebar: join(buildPaths.root, 'installer-ui', 'uninstaller-sidebar.bmp'),
      uninstallerSidebar: join(buildPaths.root, 'installer-ui', 'uninstaller-sidebar.bmp'),
      include: nsisInclude ?? fileURLToPath(new URL('./installer.nsh', import.meta.url)),
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      // The release contract publishes exactly one installer per Windows target,
      // so the differential payload's `.exe.blockmap` sibling must not appear.
      // A ZIP payload also spares the installer NSIS's temporary-directory copy.
      differentialPackage: false,
      useZip: true,
      installerLanguages: ['en_US', 'zh_CN'],
      installerIcon: icons.win,
      uninstallerIcon: icons.win,
      installerHeaderIcon: icons.win,
    },
    // A publish provider is what makes electron-builder write the updater
    // metadata at all, and the release contract requires all four channel files
    // beside the installers. Naming the fork's own repository keeps the metadata
    // honest about where the desktop shell resolves updates from; packaging
    // always runs with `--publish never`, so the provider is never contacted.
    // Leaving `channel` unset keeps the `latest` names the contract asserts.
    publish: update === undefined
      ? [{ provider: 'github', owner: GITHUB_RELEASE_OWNER, repo: GITHUB_RELEASE_REPO }]
      : [{ provider: 'generic', url: update.publicUrl }],
    // The static AppImage toolset carries native runtimes for every
    // architecture; the legacy 0.0.0 toolset falls back to its x64 runtime when
    // packaging arm64, which would ship an amd64 AppImage under an arm64 name.
    toolsets: { appimage: '1.0.3' },
    detectUpdateChannel: false,
  }
}
