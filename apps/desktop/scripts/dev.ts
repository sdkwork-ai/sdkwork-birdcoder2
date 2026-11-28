/** Build and launch the unpackaged Electron shell; `--online` targets the production tier with a request log. */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { resolveApplicationCode } from '../../../packages/boot/sdkwork-env-bootstrap/src/index.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'
import { developmentRuntimeDirectory, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { prepareDevelopmentProject } from './development-project.ts'
import { prepareDevelopmentApp } from './development-app.ts'
import { prepareDevelopmentState } from './development-state.ts'
import { buildNativePackage, nativeBuildEnvironment, nativePackageBuildAt, type NativePackageBuild } from './native-package-builds.mjs'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'
import { KEEP_INHERITED_SDKWORK_ENV, developmentLaunchEnvironment } from './development-sdkwork-env.ts'
import { selectDevelopmentHome } from './development-home.ts'
import { UPSTREAM_DSH_HOME_DIR_NAME, brandHomePath, resolveRuntimeBrand } from '../src/brand.ts'
import { applyDevelopmentGateway, resolveDevelopmentGateway } from './development-gateway.ts'
import { parseDevelopmentArguments, type DevelopmentArguments } from './development-arguments.ts'
import type { DevelopmentLane } from './development-ports.ts'
import {
  acquireDevelopmentLauncherLock,
  claimDevelopmentLane,
  clearLaneInstance,
  laneIdentityMarkers,
  laneInstancePath,
  writeLaneInstance,
} from './development-lane-instance.ts'
import { INSECURE_TLS_ELECTRON_SWITCH, ONLINE_REQUEST_LOG_VARIABLE, PRODUCTION_GATEWAY_URL, PRODUCTION_PROFILE_ID, insecureTlsLaunchEnvironment, onlineBuildEnvironment, onlineLaunchEnvironment } from './online-debug-launch.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
const DEVELOPMENT_ROOT = join(BUILD_ROOT, 'development')
/** Local application-data subdirectory holding the staged Electron mirror of this checkout. */
const STAGED_ELECTRON_DIRECTORY = join('dsh-desktop-dev-electron', 'electron-dist')
/** Home, npm project and browser data of the `--online` debug lane, kept out of the development state. */
const ONLINE_ROOT = join(BUILD_ROOT, 'online')
/** Web port the development shell serves; the packaged shell keeps the default, so both run at once. */
const DEVELOPMENT_HOST_WEB_PORT = 19388
/** Web port the `--online` debug shell serves, so it runs beside a development shell. */
const ONLINE_HOST_WEB_PORT = 19389
/** Request logger preloaded into the `--online` Electron child through `NODE_OPTIONS`. */
const ONLINE_REQUEST_LOG_MODULE = join(APP_ROOT, 'scripts', 'online-request-log.cjs')

interface PackageManifest {
  readonly version?: string
}

function packageVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
  if (typeof manifest.version !== 'string') throw new Error(`desktop development: ${subject} has no version`)
  return manifest.version
}

function debugPort(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`desktop development: ${name} must be an integer from 1 through 65535`)
  }
  return port
}

/** Child process failure that keeps the numeric exit status the launcher interprets. */
class ChildExitError extends Error {
  /** Exit status, or `undefined` when the child ended on a signal. */
  readonly status: number | undefined

  constructor(message: string, status: number | undefined) {
    super(message)
    this.name = 'ChildExitError'
    this.status = status
  }
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  environment = process.env,
  onSpawn?: (pid: number | undefined) => void,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: 'inherit' })
    onSpawn?.(child.pid)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new ChildExitError(`desktop development: ${args.join(' ')} exited with ${String(code ?? signal)}`,
        code ?? undefined))
    })
  })
}

/** Workspace packages declaring `dsh.native`; development loads them in place, so they build in their own directories. */
function workspaceNativePackages(): NativePackageBuild[] {
  const packages = join(REPOSITORY_ROOT, 'packages')
  return readdirSync(packages, { withFileTypes: true }).filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(packages, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory())
      .map(entry => nativePackageBuildAt(join(packages, group.name, entry.name))))
    .filter(declaration => declaration !== undefined)
}

async function runPackageScript(script: string, cwd: string): Promise<void> {
  const packageManager = process.env.npm_execpath
  if (packageManager === undefined || packageManager === '') {
    throw new Error('desktop development: invoke this launcher through pnpm run dev:desktop or start:desktop')
  }
  // FORK DIVERGENCE (upstream always runs `npm_execpath` through Node): the standalone
  // pnpm distribution reports `npm_execpath` as its native binary, which Node rejects with
  // ERR_UNKNOWN_FILE_EXTENSION, so resolve the invocation the shared way instead.
  const invocation = pnpmInvocation(['run', script])
  await run(invocation.command, invocation.args, cwd, environment)
}

/**
 * Root of the per-user application data on this machine, where the staged
 * Electron mirror lives: a build directory inside the checkout is itself a
 * location some machine-local security software refuses.
 * @returns absolute local application-data directory.
 */
function localApplicationDataDirectory(): string {
  const configured = process.env.LOCALAPPDATA
  if (configured !== undefined && configured.trim() !== '') return configured
  return join(homedir(), 'AppData', 'Local')
}

/**
 * Mirror the electron distribution to a per-user directory outside the checkout
 * and return the staged executable. Machine-local security software hooks
 * process creation by image path: Electron started from anywhere inside the
 * checkout dies with STATUS_BREAKPOINT before the main script runs, while a
 * byte-identical copy under the local application data starts.
 * @param electron - executable of the installed electron package.
 * @returns absolute path of the staged executable.
 */
function stagedElectronExecutable(electron: string): string {
  const source = resolve(electron, '..')
  const target = join(localApplicationDataDirectory(), STAGED_ELECTRON_DIRECTORY)
  const sourceBinary = join(source, 'electron.exe')
  const targetBinary = join(target, 'electron.exe')
  const stale = (() => {
    if (!existsSync(targetBinary)) return true
    const sourceSize = statSync(sourceBinary).size
    const targetSize = statSync(targetBinary).size
    return sourceSize !== targetSize
      || statSync(sourceBinary).mtimeMs > statSync(targetBinary).mtimeMs
  })()
  if (stale) {
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
  }
  return targetBinary
}

/** Windows exit status Chromium reports when something kills it before the main script runs. */
const STATUS_BREAKPOINT = 2_147_483_651

/** Meaning and remedies of {@link STATUS_BREAKPOINT}, whose number alone names no cause. */
const BREAKPOINT_HINT = 'desktop development: STATUS_BREAKPOINT means the operating system or a local security filter '
  + 'refused this Electron before the main script ran; allow the checkout and '
  + `${join(localApplicationDataDirectory(), STAGED_ELECTRON_DIRECTORY)} in that filter, or relaunch with `
  + 'DSH_DESKTOP_DEV_NO_SANDBOX=1 to relax the Chromium sandbox'

/**
 * Run the Electron child, reporting {@link STATUS_BREAKPOINT} with its remedies.
 * @param executable - Electron binary to launch.
 * @param args - command line switches followed by the application directory.
 * @param cwd - working directory of the child.
 * @param environment - composed launch environment.
 * @param onSpawn - receives the child pid once it is running.
 */
async function runElectron(
  executable: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  onSpawn?: (pid: number | undefined) => void,
): Promise<void> {
  try {
    await run(executable, args, cwd, environment, onSpawn)
  } catch (error) {
    if (!(error instanceof ChildExitError) || error.status !== STATUS_BREAKPOINT) throw error
    throw new ChildExitError(`${error.message}\n${BREAKPOINT_HINT}`, error.status)
  }
}

/**
 * Harness homes a source lane must not adopt by inheritance: the installed
 * application's brand home, and the upstream `~/.dsh` a separately installed
 * `dsh` keeps writing.
 * @returns absolute home paths a source lane must not adopt by inheritance.
 */
function installedHarnessHomes(): string[] {
  const brand = resolveRuntimeBrand({ env: process.env })
  return [brandHomePath(brand), join(homedir(), UPSTREAM_DSH_HOME_DIR_NAME)]
}

/** Lane state one Electron launch owns and records for the next launch. */
interface LaunchingLane {
  /** Lane this launch starts. */
  readonly lane: DevelopmentLane
  /** Web port the lane binds. */
  readonly port: number
  /** Persisted record naming the started Electron process. */
  readonly instancePath: string
  /** Browser data directory, also the identity of this lane's processes. */
  readonly userData: string
  /** Disposable npm project this lane boots, which carries its runtime descriptor. */
  readonly projectDir: string
}

/**
 * Start one Electron shell for a lane, and keep the lane's record while it runs.
 * @param sdkworkEnvironment - composed SDKWork environment.
 * @param online - whether this launch is the online debug lane.
 * @param insecureTls - whether to accept unverifiable certificates.
 * @param stateRoot - the lane's state directory.
 * @param home - Harness home of this launch.
 * @param lane - lane state this launch owns and records.
 * @param onSpawned - receives the started shell's pid, after the lane record is written.
 */
async function launchElectron(
  sdkworkEnvironment: NodeJS.ProcessEnv,
  online: boolean,
  insecureTls: boolean,
  stateRoot: string,
  home: string,
  lane: LaunchingLane,
  onSpawned: (pid: number | undefined) => void,
): Promise<void> {
  const require = createRequire(import.meta.url)
  const electron: unknown = require('electron')
  if (typeof electron !== 'string') throw new Error('desktop development: electron executable is unavailable')
  const mainPort = debugPort('DSH_DESKTOP_MAIN_INSPECT_PORT', 9229)
  const rendererPort = debugPort('DSH_DESKTOP_RENDERER_DEBUG_PORT', 9222)
  const hostPort = debugPort('DSH_DESKTOP_HOST_INSPECT_PORT', 9230)
  const userData = lane.userData
  const environment: NodeJS.ProcessEnv = {
    ...sdkworkEnvironment,
    DSH_HOME: home,
    // The shell boots the disposable project this launch prepared; each lane keeps
    // its own, so a development and an online shell never replace each other's
    // project while both run.
    DSH_DESKTOP_DSH_DIR: lane.projectDir,
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR: process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR ?? developmentRuntimeDirectory(),
    DSH_DESKTOP_HOST_INSPECT_PORT: String(hostPort),
    // The Host reads its Web port from this variable; without it the development
    // shell would bind the packaged default and fail while a packaged app runs.
    DSH_DESKTOP_HOST_WEB_PORT: process.env.DSH_DESKTOP_HOST_WEB_PORT
      ?? String(online ? ONLINE_HOST_WEB_PORT : DEVELOPMENT_HOST_WEB_PORT),
    DSH_DESKTOP_OPEN_DEVTOOLS: process.env.DSH_DESKTOP_OPEN_DEVTOOLS ?? '1',
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? '1',
    // A shell inside an Electron host inherits ELECTRON_RUN_AS_NODE; left set, this Electron
    // starts as plain Node, which rejects the Chromium switches below with "bad option" and
    // exit 9. An undefined value omits the variable from the child environment.
    ELECTRON_RUN_AS_NODE: undefined,
  }
  if (insecureTls) {
    // A self-signed production gateway fails every side by default: the Node
    // Host with DEPTH_ZERO_SELF_SIGNED_CERT, the renderer with
    // net::ERR_CERT_AUTHORITY_INVALID. Both sides accept the certificate only
    // through this explicit debug-lane opt-in.
    console.warn('desktop development: TLS verification DISABLED '
      + `(${INSECURE_TLS_ELECTRON_SWITCH}, NODE_TLS_REJECT_UNAUTHORIZED=0) - debug lane only; prefer `
      + 'NODE_EXTRA_CA_CERTS with the gateway certificate for real use')
  }
  const launchEnvironment = insecureTls ? insecureTlsLaunchEnvironment(environment) : environment
  console.log(`desktop development: DSH_HOME=${home}`)
  console.log(`desktop development: userData=${userData}`)
  console.log(`desktop development: inspectors main=${String(mainPort)}, renderer=${String(rendererPort)}, host=${String(hostPort)}`
    + (online ? '; attach the debugger through chrome://inspect (renderer console) or your IDE inspector (main and host)' : ''))
  // Record the shell as this lane's owner, and keep the record only while it runs.
  // The next launch of the lane replaces that process tree, so a window closed
  // into the tray never leaves the relaunch without a window to show.
  const launch = async (executable: string, args: readonly string[]): Promise<void> => {
    let launched: number | undefined
    try {
      await runElectron(executable, args, APP_ROOT, launchEnvironment, (pid) => {
        launched = pid
        if (pid !== undefined) {
          writeLaneInstance(lane.instancePath, { schemaVersion: 1, lane: lane.lane, port: lane.port, pid })
        }
        onSpawned(pid)
      })
    } finally {
      if (launched !== undefined) clearLaneInstance(lane.instancePath, launched)
    }
  }
  if (process.platform === 'darwin') {
    const executable = prepareDevelopmentApp({ electron, appRoot: APP_ROOT, directory: stateRoot, home, userData,
      mainPort, rendererPort, hostPort, openDevtools: launchEnvironment.DSH_DESKTOP_OPEN_DEVTOOLS! })
    await launch(executable, [])
    return
  }
  let executable = electron
  // Windows development launches from the per-user staged mirror below by default:
  // machine-local security software kills an Electron image that lives anywhere
  // inside the checkout, whatever directory the copy keeps there. Set
  // DSH_DESKTOP_DEV_STAGED_ELECTRON=0 to launch from node_modules directly.
  if (process.platform === 'win32' && process.env.DSH_DESKTOP_DEV_STAGED_ELECTRON !== '0') {
    executable = stagedElectronExecutable(electron)
    console.log(`desktop development: electron staged to ${executable}`)
  }
  const arguments_: string[] = [
    `--inspect=127.0.0.1:${String(mainPort)}`,
    `--remote-debugging-port=${String(rendererPort)}`,
    `--user-data-dir=${userData}`,
  ]
  if (insecureTls) arguments_.push(INSECURE_TLS_ELECTRON_SWITCH)
  // Some machine-local security software (Defender off, an EDR kernel filter on top)
  // kills sandboxed Chromium child-process creation, so this Electron dies with
  // STATUS_BREAKPOINT before main runs. Opt in per machine with this variable;
  // packaged installs keep the sandbox.
  if (process.env.DSH_DESKTOP_DEV_NO_SANDBOX === '1') {
    arguments_.push('--no-sandbox')
    console.log('desktop development: chromium sandbox disabled (DSH_DESKTOP_DEV_NO_SANDBOX=1)')
  }
  arguments_.push(APP_ROOT)
  await launch(executable, arguments_)
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'skip-build': { type: 'boolean', default: false } } })
  if (!values['skip-build']) {
    await runPackageScript('build:artifacts', REPOSITORY_ROOT)
    await runPackageScript('build', APP_ROOT)
    // Without a C++ toolchain, development uses the consumers' unavailable-addon fallbacks.
    if (process.platform === 'darwin' || process.platform === 'win32') await runPackageScript('build:native', APP_ROOT).catch((error: unknown) => {
      console.warn(`desktop development: shared-texture addons not built: ${error instanceof Error ? error.message : String(error)}`)
    })
    // Packaging's build environment: on Windows, the MSVC developer environment for this architecture.
    for (const declaration of workspaceNativePackages()) {
      try { buildNativePackage(declaration, process.arch, nativeBuildEnvironment(process.arch)) } catch (error) {
        console.warn(`desktop development: ${declaration.name} native addon not built: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // FORK DIVERGENCE: the online debug lane targets the deployed production tier
    // SDKWork value is inherited untouched.  }
  // A packaged Desktop application exports the deployment it resolved into every child
  // process, so a shell that carries that environment would otherwise point this source
  // run at the packaged deployment. The checkout owns the development tier, so both builds
  // below run under the development environment: the client artifacts project its gateway
  // into the browser, and the Desktop Host resolves the matching bootstrap token from the
  // same environment when it starts.
  const sdkwork = developmentLaunchEnvironment(process.env, {
    applicationCode: resolveApplicationCode(REPOSITORY_ROOT),
  })
  if (sdkwork.dropped.length > 0) {
    console.log('desktop development: declaring the development SDKWork environment, dropping the inherited '
      + `production values (${sdkwork.dropped.join(', ')}); set ${KEEP_INHERITED_SDKWORK_ENV}=1 to keep them`)
  }
  const gatewayPort = arguments_.gatewayPort === undefined ? undefined : Number(arguments_.gatewayPort)
  const gateway = resolveDevelopmentGateway(arguments_.gateway, gatewayPort)
  console.log(`desktop development: SDKWork gateway=${gateway.url} (${gateway.mode})`)
  if (arguments_.printGateway) return
  const sdkworkEnvironment = applyDevelopmentGateway(sdkwork.environment, gateway)
  await launchDevelopment(sdkworkEnvironment, sdkworkEnvironment, online, arguments_)
}

/** Shared tail of both lanes: build, stage the development project, launch Electron. */
async function launchDevelopment(
  buildEnvironment: NodeJS.ProcessEnv,
  launchEnvironment: NodeJS.ProcessEnv,
  online: boolean,
  options: DevelopmentArguments,
): Promise<void> {
  // The online lane keeps its own Harness home and browser data so production
  // credentials and sessions never mix with the development state.
  const stateRoot = online ? ONLINE_ROOT : DEVELOPMENT_ROOT
  const lane: DevelopmentLane = online ? 'online' : 'development'
  const projectDir = join(stateRoot, 'project')
  // The disposable project is shared build state: a second launch that prepares it
  // deletes the runtime descriptor the first window is about to boot, and that
  // window then fails inside Electron instead of starting. Claim the preparation
  // before anything is built, and record the claim's release once the window runs.
  const launcherLock = await acquireDevelopmentLauncherLock({ lane, stateRoot })
  try {
    const homeSelection = selectDevelopmentHome({
      environment: process.env,
      laneHome: join(stateRoot, 'home'),
      installedHomes: installedHarnessHomes(),
      allowInstalledHome: process.env.DSH_DESKTOP_DEV_INSTALLED_HOME === '1',
    })
    if (homeSelection.notice !== undefined) console.log(homeSelection.notice)
    const userData = resolve(process.env.DSH_DESKTOP_USER_DATA_DIR ?? join(stateRoot, 'electron-user-data'))
    const instancePath = laneInstancePath(stateRoot)
    const lanePort = debugPort('DSH_DESKTOP_HOST_WEB_PORT', online ? ONLINE_HOST_WEB_PORT : DEVELOPMENT_HOST_WEB_PORT)
    // A previous window of this lane still holds its Host web port, the Chromium
    // single-instance lock, and this lane's record; a launch beside it would only
    // focus the old window, so replace it before building.
    const claimed = await claimDevelopmentLane({
      lane,
      port: lanePort,
      instancePath,
      markers: laneIdentityMarkers({ stateRoot, userData, home: homeSelection.home }),
    })
    if (claimed.replaced.length > 0) {
      console.log(`desktop development: replaced the ${lane} lane window of the previous launch `
        + `(pid ${claimed.replaced.join(', ')}); closing a window hides it, so it was still running`)
    }
    if (!options.skipBuild) {
      // The Web build bakes the SDKWork env file its mode selects, so each lane
      // builds its own environment: the development shell bakes
      // `.env.standalone.development`, the online shell bakes production. The
      // resolved gateway is the one launch-time value the file cannot carry
      // (`--gateway`), so it goes through the build's explicit override channel.
      const gatewayOverride = buildEnvironment.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL?.trim()
      await runPackageScript('build:artifacts', REPOSITORY_ROOT, {
        ...buildEnvironment,
        DSH_WEB_BUILD_MODE: online ? 'production' : 'development',
        ...gatewayOverride === undefined || gatewayOverride === ''
          ? {}
          : { DSH_WEB_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: gatewayOverride },
      })
      await runPackageScript('build', APP_ROOT, buildEnvironment)
    }
    for (const path of [
      join(APP_ROOT, 'lib', 'main.js'),
      join(REPOSITORY_ROOT, 'apps', 'desktop-host', 'lib', 'index.js'),
    ]) {
      if (!existsSync(path)) throw new Error(`desktop development: missing built artifact ${path}`)
    }
    const version = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
    const pnpmVersion = packageVersion(join(APP_ROOT, 'node_modules', 'pnpm', 'package.json'), 'pnpm package')
    const release: DesktopRelease = {
      schemaVersion: 1,
      version,
      hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
      nodeVersion: execFileSync(createRequire(import.meta.url)('electron') as string, ['-p', 'process.versions.node'],
        { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim(),
      pnpmVersion,
    }
    prepareDevelopmentProject({
      projectDir,
      cliDir: join(REPOSITORY_ROOT, 'apps', 'cli'),
      hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
      dependencyDir: join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules'),
      release,
      target: resolveDesktopBuildTarget(),
    })
    await preparePrimaryRuntime()
    await launchElectron(launchEnvironment, online, options.insecureTLS, stateRoot, homeSelection.home,
      { lane, port: lanePort, instancePath, userData, projectDir }, () => { launcherLock.release() })
  } finally {
    // The started shell has its own record, so the claim never outlives a failed
    // preparation or a launcher that stopped before spawning one.
    launcherLock.release()
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
