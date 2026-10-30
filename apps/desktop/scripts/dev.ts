/** Build and launch the unpackaged Electron shell; `--online` targets the production tier with a request log. */

import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'
import { developmentRuntimeDirectory, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { prepareDevelopmentProject } from './development-project.ts'
import { prepareDevelopmentApp } from './development-app.ts'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'
import { KEEP_INHERITED_SDKWORK_ENV, developmentLaunchEnvironment } from './development-sdkwork-env.ts'
import { applyDevelopmentGateway, resolveDevelopmentGateway } from './development-gateway.ts'
import { INSECURE_TLS_ELECTRON_SWITCH, ONLINE_REQUEST_LOG_VARIABLE, PRODUCTION_GATEWAY_URL, PRODUCTION_PROFILE_ID, insecureTlsLaunchEnvironment, onlineBuildEnvironment, onlineLaunchEnvironment } from './online-debug-launch.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
const DEVELOPMENT_ROOT = join(BUILD_ROOT, 'development')
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

async function run(command: string, args: readonly string[], cwd: string, environment = process.env): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop development: ${args.join(' ')} exited with ${String(code ?? signal)}`))
    })
  })
}

async function runPackageScript(script: string, cwd: string, environment: NodeJS.ProcessEnv): Promise<void> {
  if (process.env.npm_execpath === undefined || process.env.npm_execpath === '') {
    throw new Error('desktop development: invoke this launcher through pnpm run dev:desktop or start:desktop')
  }
  // FORK DIVERGENCE (upstream always runs `npm_execpath` through Node): the standalone
  // pnpm distribution reports `npm_execpath` as its native binary, which Node rejects with
  // ERR_UNKNOWN_FILE_EXTENSION, so resolve the invocation the shared way instead.
  const invocation = pnpmInvocation(['run', script])
  await run(invocation.command, invocation.args, cwd, environment)
}

/**
 * Mirror the electron distribution out of node_modules and return the staged
 * executable. Some machine-local security software interferes with Chromium
 * process creation for executables that live under node_modules or the
 * repository root while an identical copy in a nested ordinary directory runs
 * fine, so this opt-in stage gives that software a path it tolerates.
 */
function stagedElectronExecutable(electron: string): string {
  const source = resolve(electron, '..')
  const target = join(DEVELOPMENT_ROOT, 'electron-dist')
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

async function launchElectron(sdkworkEnvironment: NodeJS.ProcessEnv, online: boolean, insecureTls: boolean): Promise<void> {
  const require = createRequire(import.meta.url)
  const electron: unknown = require('electron')
  if (typeof electron !== 'string') throw new Error('desktop development: electron executable is unavailable')
  const mainPort = debugPort('DSH_DESKTOP_MAIN_INSPECT_PORT', 9229)
  const rendererPort = debugPort('DSH_DESKTOP_RENDERER_DEBUG_PORT', 9222)
  const hostPort = debugPort('DSH_DESKTOP_HOST_INSPECT_PORT', 9230)
  // The online lane keeps its own Harness home and browser data so production
  // credentials and sessions never mix with the development state.
  const stateRoot = online ? ONLINE_ROOT : DEVELOPMENT_ROOT
  const home = resolve(process.env.DSH_HOME ?? join(stateRoot, 'home'))
  const userData = resolve(process.env.DSH_DESKTOP_USER_DATA_DIR ?? join(stateRoot, 'electron-user-data'))
  const environment: NodeJS.ProcessEnv = {
    ...sdkworkEnvironment,
    DSH_HOME: home,
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
  if (process.platform === 'darwin') {
    const executable = prepareDevelopmentApp({ electron, appRoot: APP_ROOT, directory: stateRoot, home, userData,
      mainPort, rendererPort, hostPort, openDevtools: launchEnvironment.DSH_DESKTOP_OPEN_DEVTOOLS! })
    await run(executable, [], APP_ROOT, launchEnvironment)
    return
  }
  let executable = electron
  // Windows development launches from the staged mirror by default: some machine-local
  // security software kills the Chromium tree when the executable lives under
  // node_modules or the repository root, while a byte-identical copy in the nested
  // ordinary .desktop-build directory runs fine. Set DSH_DESKTOP_DEV_STAGED_ELECTRON=0
  // to launch from node_modules directly.
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
  await run(executable, arguments_, APP_ROOT, launchEnvironment)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'skip-build': { type: 'boolean', default: false },
      online: { type: 'boolean', default: false },
      'insecure-tls': { type: 'boolean', default: false },
      gateway: { type: 'string', default: 'localhost' },
      'gateway-port': { type: 'string' },
      'print-gateway': { type: 'boolean', default: false },
    },
  })
  const online = values.online
  if (online && (values.gateway !== 'localhost' || values['gateway-port'] !== undefined)) {
    throw new Error('desktop development: --online targets the production gateway; '
      + '--gateway and --gateway-port select development gateways only')
  }
  if (values['insecure-tls'] && !online) {
    throw new Error('desktop development: --insecure-tls belongs to the --online debug lane')
  }
  if (online) {
    // FORK DIVERGENCE: the online debug lane targets the deployed production tier
    // (AGENTS.md, "Desktop application identity" applies to state isolation; the
    // production identity and request-log wiring live in online-debug-launch.ts).
    // The profile and gateway are guaranteed: identity and gateway keys are
    // forced to the canonical standalone.production values, and every other
    // SDKWork value is inherited untouched.
    if (!existsSync(ONLINE_REQUEST_LOG_MODULE)) {
      throw new Error(`desktop development: missing request logger ${ONLINE_REQUEST_LOG_MODULE}`)
    }
    const onlineLaunch = onlineLaunchEnvironment(process.env, { requestLogModule: ONLINE_REQUEST_LOG_MODULE })
    console.log(`desktop development: ONLINE tier (profile ${PRODUCTION_PROFILE_ID}) - local source talks to `
      + 'the deployed production environment')
    console.log(`desktop development: SDK gateway=${PRODUCTION_GATEWAY_URL}`)
    console.log(`desktop development: request log ${process.env[ONLINE_REQUEST_LOG_VARIABLE] === '0' ? 'off' : 'on'} `
      + `(${ONLINE_REQUEST_LOG_VARIABLE}=${onlineLaunch.environment[ONLINE_REQUEST_LOG_VARIABLE]})`)
    if (values['print-gateway']) return
    await launchDevelopment(onlineBuildEnvironment(onlineLaunch.environment, process.env),
      onlineLaunch.environment, online, values)
    return
  }
  // A packaged Desktop application exports the deployment it resolved into every child
  // process, so a shell that carries that environment would otherwise point this source
  // run at the packaged deployment. The checkout owns the development tier, so both builds
  // below run under the development environment: the client artifacts project its gateway
  // into the browser, and the Desktop Host resolves the matching bootstrap token from the
  // same environment when it starts.
  const sdkwork = developmentLaunchEnvironment(process.env)
  if (sdkwork.dropped.length > 0) {
    console.log('desktop development: declaring the development SDKWork environment, dropping the inherited '
      + `production values (${sdkwork.dropped.join(', ')}); set ${KEEP_INHERITED_SDKWORK_ENV}=1 to keep them`)
  }
  const gatewayPort = values['gateway-port'] === undefined ? undefined : Number(values['gateway-port'])
  const gateway = resolveDevelopmentGateway(values.gateway, gatewayPort)
  console.log(`desktop development: SDKWork gateway=${gateway.url} (${gateway.mode})`)
  if (values['print-gateway']) return
  const sdkworkEnvironment = applyDevelopmentGateway(sdkwork.environment, gateway)
  await launchDevelopment(sdkworkEnvironment, sdkworkEnvironment, online, values)
}

/** Shared tail of both lanes: build, stage the development project, launch Electron. */
async function launchDevelopment(
  buildEnvironment: NodeJS.ProcessEnv,
  launchEnvironment: NodeJS.ProcessEnv,
  online: boolean,
  values: { 'skip-build': boolean; 'insecure-tls': boolean },
): Promise<void> {
  if (!values['skip-build']) {
    await runPackageScript('build:artifacts', REPOSITORY_ROOT, buildEnvironment)
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
    projectDir: join(DEVELOPMENT_ROOT, 'project'),
    cliDir: join(REPOSITORY_ROOT, 'apps', 'cli'),
    hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
    dependencyDir: join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules'),
    release,
    target: resolveDesktopBuildTarget(),
  })
  await preparePrimaryRuntime()
  await launchElectron(launchEnvironment, online, values['insecure-tls'])
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
