import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveDesktopAppId,
  resolveMacOSNotarizationEnvironment,
  resolveMacOSSigningEnvironment,
} from './scripts/desktop-release-environment.mjs'
import { notarizeMacOSDiskImageArtifact } from './scripts/notarize-macos-disk-images.mjs'
import { verifyMacOSSignatureAfterSign } from './scripts/verify-macos-signature.mjs'
import {
  createWindowsTokenSigner,
  installWindowsNsisBootstrapSigner,
} from './scripts/windows-sign.mjs'
import { resolveDesktopAutoUpdateConfig } from './scripts/desktop-auto-update-environment.mjs'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './scripts/desktop-build-paths.mjs'

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url))

/**
 * Shipped BirdCoder brand icons, one per packaged platform.
 *
 * They are generated from the canonical `apps/web/public/favicon.png` raster and
 * are named explicitly here so an upstream change to electron-builder defaults
 * cannot silently restore the default Electron icon.
 */
const BRAND_ICONS = {
  mac: 'build/icon.icns',
  win: 'build/icon.ico',
  linux: 'build/icon.png',
}

/** The window raster the unpackaged and packaged shells load through app.getAppPath(). */
const WINDOW_ICON = 'build/icon.png'

/**
 * The fork's GitHub Release repository.
 *
 * electron-builder writes the updater metadata (`latest.yml` and its per-platform
 * siblings) only when a publish provider is configured, and the release contract
 * requires those files beside the installers. Naming the fork's own repository
 * keeps the metadata honest about where the desktop shell resolves updates from;
 * packaging always runs with `--publish never`, so the provider is never
 * contacted and uploads stay the release job's business.
 */
const GITHUB_RELEASE_OWNER = 'sdkwork-ai'
const GITHUB_RELEASE_REPO = 'sdkwork-birdcoder2'

/**
 * Resolve one shipped brand icon, failing packaging when a merge dropped it.
 * @param {string} relativePath - Project-relative icon path.
 * @returns {string} The same path, for electron-builder.
 */
function brandIcon(relativePath) {
  if (!existsSync(join(APP_ROOT, relativePath))) {
    throw new Error(`desktop icons: ${relativePath} is missing; run pnpm --dir apps/desktop run generate-icons`)
  }
  return relativePath
}

/**
 * Create electron-builder configuration from one release environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no explicit target is present.
 * @param {string} hostArch - Build-host architecture used when no explicit target is present.
 * @returns {object} electron-builder configuration.
 */
export function createElectronBuilderConfig(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  const appId = resolveDesktopAppId(env)
  const targetPlatform = env.DSH_DESKTOP_TARGET_PLATFORM
  const resolvedPlatform = targetPlatform ?? hostPlatform
  const resolvedArch = env.DSH_DESKTOP_TARGET_ARCH ?? hostArch
  if (env.DSH_DESKTOP_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_UNSIGNED must be 0 or 1')
  }
  const unsigned = env.DSH_DESKTOP_UNSIGNED === '1'
  const packagesMacOS = targetPlatform === 'darwin' || (targetPlatform === undefined && hostPlatform === 'darwin')
  const packagesWindows = targetPlatform === 'win32'
  // FORK DIVERGENCE (upstream gates unsigned builds to Windows): the fork builds
  // a six-target GitHub Release on hosts that hold no code-signing, notarization,
  // or COS credential — every macOS, Windows, and Linux artifact ships unsigned.
  // A signed run still resolves every credential up front and fails early.
  const macOSSigning = packagesMacOS && !unsigned ? resolveMacOSSigningEnvironment(env) : undefined
  if (packagesMacOS && !unsigned) resolveMacOSNotarizationEnvironment(env)
  const windowsSigner = packagesWindows && !unsigned
    ? createWindowsTokenSigner({
        certificateFile: env.DSH_DESKTOP_WINDOWS_CER_FILE,
        signTool: env.DSH_DESKTOP_WINDOWS_SIGNTOOL,
        tokenPin: env.DSH_DESKTOP_WINDOWS_TOKEN_PIN,
        keyContainer: env.DSH_DESKTOP_WINDOWS_KEY_CONTAINER,
      })
    : undefined
  if (windowsSigner !== undefined) {
    installWindowsNsisBootstrapSigner({ sign: windowsSigner })
  }
  const update = unsigned ? undefined : resolveDesktopAutoUpdateConfig(env, resolvedPlatform, resolvedArch)
  const buildPaths = desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch))
  const icons = {
    mac: brandIcon(BRAND_ICONS.mac),
    win: brandIcon(BRAND_ICONS.win),
    linux: brandIcon(BRAND_ICONS.linux),
  }
  const windowIcon = brandIcon(WINDOW_ICON)
  return {
    appId,
    // Fork brand: the BirdCoder mark, generated from the canonical product
    // raster by scripts/generate-icons.mjs.
    productName: 'BirdCoder',
    // The scoped package name (@deepseek-ai/dsh-desktop) cannot become a safe
    // executable name — Linux rejects the '@' and '/' outright — so pin a plain
    // name and keep every platform's binary and installer path stable.
    executableName: 'birdcoder',
    // `scripts/release/assemble-github-release.ts` is the release contract and it
    // names every asset `BirdCoder-(version)-(os)-(arch).(ext)`, where `(arch)` is
    // electron-builder's per-format architecture token (x64 becomes x64, x86_64, or
    // amd64; arm64 becomes arm64 or aarch64). Any other spelling fails the
    // exact-name assertion that guards the assembled release.
    artifactName: 'BirdCoder-${version}-${os}-${arch}.${ext}',
    directories: {
      output: unsigned ? join(buildPaths.root, 'unsigned-artifacts') : buildPaths.artifacts,
      buildResources: 'build',
    },
    asar: true,
    files: [
      'lib/*.js',
      'lib/*.cjs',
      'renderer/**/*',
      windowIcon,
      'package.json',
    ],
    extraResources: [
      { from: buildPaths.runtime, to: 'runtime' },
      { from: buildPaths.dsh, to: 'dsh' },
      // electron-builder excludes a source directory's root node_modules.
      { from: join(buildPaths.dsh, 'node_modules'), to: 'dsh/node_modules' },
    ],
    mac: {
      icon: icons.mac,
      category: 'public.app-category.developer-tools',
      identity: macOSSigning?.signingIdentity,
      forceCodeSigning: !unsigned,
      // Hardened runtime is a code-signing flag: with no identity to carry it,
      // asking for it only makes electron-builder complain.
      hardenedRuntime: !unsigned,
      // Native runtime files are pre-signed; PAK resources are sealed by their enclosing bundle.
      signIgnore: ['/Contents/Resources/dsh(?:/|$)', '\\.pak$'],
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
    afterPack: async context => {
      const { verifyDesktopRuntime } = await import('./lib/types/runtime-tree.js')
      await verifyDesktopRuntime(join(context.packager.getResourcesDir(context.appOutDir), 'dsh'),
        context.packager.appInfo.version, { platform: resolvedPlatform, arch: resolvedArch })
    },
    afterSign: async context => {
      if (context.electronPlatformName !== 'darwin') return
      const { verifyDesktopRuntime } = await import('./lib/types/runtime-tree.js')
      await verifyDesktopRuntime(join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'dsh'),
        context.packager.appInfo.version, { platform: 'darwin', arch: resolvedArch })
      // An unsigned run carries no signature to verify, and resolving the signing
      // identity here would demand exactly the credentials the mode drops.
      if (unsigned) return
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
        signingHashAlgorithms: ['sha256'],
      },
      // FORK DIVERGENCE (upstream ships the NSIS installer alone): the release
      // contract publishes a portable ZIP beside it, on both architectures.
      target: ['nsis', 'zip'],
    },
    linux: {
      icon: icons.linux,
      category: 'Development',
      // fpm refuses a scoped package name, and the release contract names the
      // installer family after the product rather than the workspace member.
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
      include: fileURLToPath(new URL('./scripts/installer.nsh', import.meta.url)),
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      // The release contract publishes exactly one installer per Windows target,
      // so the differential payload's `.exe.blockmap` sibling must not appear.
      // A ZIP payload also spares the installer NSIS's temporary-directory copy.
      differentialPackage: false,
      useZip: true,
      installerIcon: icons.win,
      uninstallerIcon: icons.win,
      installerHeaderIcon: icons.win,
    },
    // A publish provider is what makes electron-builder write the updater
    // metadata at all, and the release contract requires all four channel files
    // (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`, `latest-linux-arm64.yml`)
    // beside the installers. It is also what names their channel: leaving
    // `channel` unset keeps the `latest` names the contract asserts, where a
    // prerelease-derived channel would emit `rc.yml` and fail assembly.
    publish: update === undefined
      ? [{ provider: 'github', owner: GITHUB_RELEASE_OWNER, repo: GITHUB_RELEASE_REPO }]
      : [{ provider: 'generic', url: update.publicUrl }],
    // The static AppImage toolset carries native runtimes for every
    // architecture; the legacy 0.0.0 toolset falls back to its x64 runtime when
    // packaging arm64, which would ship an amd64 AppImage under an arm64 name.
    toolsets: { appimage: '1.0.3' },
  }
}

export default createElectronBuilderConfig()
