/**
 * Probe the external tools a packaging run will shell out to, before it starts.
 *
 * The packaging sequence reaches its first archive step minutes in, and its
 * first installer step later still, so a tool that is absent or behaves
 * differently than the scripts assume wastes a whole run. Each probe here
 * exercises the specific behaviour the run depends on rather than merely
 * checking that the executable resolves.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * FORK DIVERGENCE: environment variable that names an explicit Visual Studio
 * installation root. The shipped lane locates Visual Studio through
 * `vswhere.exe`, which reads the Visual Studio Installer's registered instances;
 * a Build Tools layout copied to a local directory is not registered there, so
 * `vswhere -all` reports nothing while `cl.exe` and `vcvars32.bat` are present
 * and working. This variable lets a Windows packaging host name that root
 * instead of registering a machine-wide instance.
 */
export const DESKTOP_VS_INSTALLATION_PATH_ENV = 'DSH_DESKTOP_VS_INSTALLATION_PATH'

/** One tool the packaging run requires, and what went wrong with it. */
export interface DesktopToolchainProbeFailure {
  readonly tool: string
  readonly detail: string
}

async function probeTar(): Promise<string | undefined> {
  // GNU tar reads the colon in an absolute Windows path as a remote-host separator, which the
  // release scripts avoid by running beside the archive; this probe confirms the archive reader works there.
  const directory = await mkdtemp(join(tmpdir(), 'dsh-tar-probe-'))
  try {
    const member = join(directory, 'probe.txt')
    await writeFile(member, 'probe\n')
    const archive = join(directory, 'probe.tar.gz')
    await run('tar', ['-czf', basename(archive), basename(member)], { cwd: directory, windowsHide: true, timeout: 20_000 })
    const listed = await run('tar', ['-tzf', basename(archive)], { cwd: dirname(archive), windowsHide: true, timeout: 20_000 })
    if (!listed.stdout.includes('probe.txt')) return `tar listed ${JSON.stringify(listed.stdout)} instead of the archived member`
    return undefined
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function probeWindowsInstallerToolchain(environment: NodeJS.ProcessEnv): Promise<DesktopToolchainProbeFailure[]> {
  const failures: DesktopToolchainProbeFailure[] = []
  // FORK DIVERGENCE: an explicitly named installation root is probed as-is; see
  // {@link DESKTOP_VS_INSTALLATION_PATH_ENV}. The installer preparation script
  // resolves the same variable, so both steps agree on which toolchain compiles.
  const configured = environment[DESKTOP_VS_INSTALLATION_PATH_ENV]?.trim()
  if (configured !== undefined && configured !== '') {
    const vcvars = join(configured, 'VC', 'Auxiliary', 'Build', 'vcvars32.bat')
    if (!existsSync(vcvars)) {
      failures.push({
        tool: 'vcvars32.bat',
        detail: `${vcvars} is missing; point ${DESKTOP_VS_INSTALLATION_PATH_ENV} at a Visual Studio installation root`,
      })
    }
    return failures
  }
  const programFiles = environment['ProgramFiles(x86)']
  const vswhere = programFiles === undefined
    ? undefined
    : join(programFiles, 'Microsoft Visual Studio/Installer/vswhere.exe')
  if (vswhere === undefined) {
    failures.push({ tool: 'vswhere', detail: 'ProgramFiles(x86) is not set, so Visual Studio cannot be located' })
  }
  else {
    try {
      const located = await run(vswhere, ['-latest', '-products', '*',
        '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
      { windowsHide: true, timeout: 30_000 })
      if (located.stdout.trim() === '') {
        failures.push({ tool: 'vswhere', detail: 'Visual Studio C++ build tools are not installed, so the installer helper cannot compile' })
      }
    }
    catch (error) {
      failures.push({ tool: 'vswhere', detail: error instanceof Error ? error.message : String(error) })
    }
  }
  return failures
}

/**
 * Probe every external tool one packaging run needs.
 * @param platform - Target platform; a Windows target already requires a Windows build host.
 * @param environment - Packaging environment used to locate Windows tooling.
 * @param options - Lane selection: `installerToolchain` probes the Visual
 *   Studio toolchain the NSIS installer helper compiles with. An unpacked
 *   `--dir` run never invokes that toolchain, so probing it there would fail
 *   the run for a tool the sequence never uses.
 * @returns Every probe that failed, empty when the host can run the packaging sequence.
 */
export async function probeDesktopToolchain(
  platform: 'darwin' | 'win32',
  environment: NodeJS.ProcessEnv = process.env,
  options: { installerToolchain?: boolean } = {},
): Promise<readonly DesktopToolchainProbeFailure[]> {
  const failures: DesktopToolchainProbeFailure[] = []
  const tar = await probeTar()
  if (tar !== undefined) failures.push({ tool: 'tar', detail: tar })
  if (platform === 'win32' && options.installerToolchain === true) {
    failures.push(...await probeWindowsInstallerToolchain(environment))
  }
  return failures
}

/**
 * Probe the toolchain and fail with every problem the host has.
 * @param platform - Target platform; a Windows target already requires a Windows build host.
 * @param environment - Packaging environment used to locate Windows tooling.
 * @param options - Lane selection; see {@link probeDesktopToolchain}.
 * @returns Resolves when every probe passes.
 */
export async function requireDesktopToolchain(
  platform: 'darwin' | 'win32',
  environment: NodeJS.ProcessEnv = process.env,
  options: { installerToolchain?: boolean } = {},
): Promise<void> {
  const failures = await probeDesktopToolchain(platform, environment, options)
  if (failures.length === 0) return
  throw new Error(`desktop package: the build host cannot run this packaging sequence:\n${
    failures.map(failure => `  ${failure.tool}: ${failure.detail}`).join('\n')}`)
}
