/**
 * Cross-platform native path and text-document openers used by the local GUI
 * carrier.
 *
 * The default intent prefers the default browser for documents it renders when
 * the platform can name one, then falls back to the default application. WSL
 * translates every path for the Windows desktop instead of assuming a Linux
 * GUI. The text-editor intent never consults the browser. The terminal intent
 * opens PowerShell on Windows wherever one is installed, and the platform's own
 * console only where none is.
 */

import { release as osRelease } from 'node:os'
import { extname } from 'node:path'
import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'

/** Testable command boundary; native implementations never invoke a shell. */
export type PathOpenerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface PathOpenerInternals {
  platform?: NodeJS.Platform
  /** Kernel release override used to distinguish WSL from desktop Linux. */
  osRelease?: string
  /** Environment used for WSL markers and the desktop Linux browser convention. */
  env?: NodeJS.ProcessEnv
  run?: PathOpenerRunner
}

/** Documents a browser renders, as opposed to ones an editor merely edits. */
const BROWSER_DOCUMENTS = new Set(['.html', '.htm', '.xhtml', '.svg'])

/**
 * The macOS bundle registered for `https` — the default browser, as
 * LaunchServices records it. The nested version dict is stripped first
 * because it carries its own `LSHandlerRoleAll`.
 */
function macBundleForHttps(plist: string): string | undefined {
  const stripped = plist.replace(/LSHandlerPreferredVersions\s*=\s*\{[^}]*\};/g, '')
  const block = /\{[^{}]*LSHandlerURLScheme\s*=\s*"?https"?;[^{}]*\}/.exec(stripped)?.[0]
  if (block === undefined) return undefined
  return /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(block)?.[1]
}

/**
 * Open one browser-renderable document with the default browser.
 * @returns true when a browser took it; false when this platform cannot name
 * one, or naming it failed — the caller then uses the default application.
 */
async function openInBrowser(
  path: string, signal: AbortSignal, platform: NodeJS.Platform,
  run: PathOpenerRunner, env: NodeJS.ProcessEnv,
): Promise<boolean> {
  if (platform === 'darwin') {
    let bundle: string | undefined
    try {
      const { stdout } = await run(
        'defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure'], signal)
      bundle = macBundleForHttps(stdout)
    } catch {
      // No LaunchServices record (a fresh account never changed a default):
      // the content-type handler is then the system's own choice anyway.
      return false
    }
    if (bundle === undefined) return false
    await run('open', ['-b', bundle, path], signal)
    return true
  }
  if (platform === 'linux') {
    // $BROWSER is the portable convention; desktop-entry resolution through
    // xdg-settings needs a launcher this package has no business shipping.
    const browser = env.BROWSER
    if (browser === undefined || browser === '') return false
    await run(browser, [path], signal)
    return true
  }
  // Windows names no browser without reading the UserChoice registry, and its
  // .html association is the browser in the ordinary case.
  return false
}

/** Native path-open intent; macOS distinguishes text editing from file association. */
type PathOpenIntent = 'default' | 'text-editor' | 'terminal'

/**
 * Windows terminal hosts in preference order: PowerShell 7+ where the user
 * installed it, then the Windows PowerShell 5.1 every supported Windows
 * carries. `cmd.exe` is the fallback for an image that has neither.
 */
const WINDOWS_POWERSHELL_HOSTS = ['pwsh.exe', 'powershell.exe'] as const

/** PowerShell single-quoted literal (doubles embedded quotes). */
function powershellLiteral(path: string): string {
  return `'${path.replace(/'/g, "''")}'`
}

/** Whether one environment marker is set to a non-empty value. */
function present(value: string | undefined): boolean {
  return value !== undefined && value !== ''
}

/** Distinguish WSL from desktop Linux using its process and kernel markers. */
function isWsl(internals: PathOpenerInternals): boolean {
  const env = internals.env ?? process.env
  if (present(env.WSL_DISTRO_NAME) || present(env.WSL_INTEROP)) return true
  return (internals.osRelease ?? osRelease()).toLowerCase().includes('microsoft')
}

/** Open one Windows-resolvable path through its registered desktop application. */
async function openWindowsPath(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Invoke-Item -LiteralPath ${powershellLiteral(path)}`,
  ], signal)
}

/** Translate a WSL path before handing it to the Windows desktop. */
async function openWslPath(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  const translated = await run('wslpath', ['-w', path], signal)
  signal.throwIfAborted()
  const windowsPath = translated.stdout.replace(/[\r\n]+$/, '')
  if (windowsPath === '') throw new Error('wslpath returned no Windows path')
  await openWindowsPath(windowsPath, signal, run)
}

/** Open one directory in a new system terminal window. */
async function openTerminalIn(
  path: string,
  signal: AbortSignal,
  platform: NodeJS.Platform,
  run: PathOpenerRunner,
): Promise<void> {
  if (platform === 'darwin') {
    // Terminal.app resolves a directory path argument to its initial cwd.
    await run('open', ['-a', 'Terminal', path], signal)
    return
  }
  if (platform === 'win32') {
    await openWindowsTerminal(path, signal, run)
    return
  }
  if (platform === 'linux') {
    // xdg-terminal-exec (freedesktop) resolves the user's default terminal;
    // gnome-terminal is the portable fallback for heads without it.
    try {
      await run('xdg-terminal-exec', [path], signal)
    } catch {
      await run('gnome-terminal', ['--working-directory', path], signal)
    }
    return
  }
  throw new Error(`native terminal opener is unsupported on ${platform}`)
}

/**
 * Whether one executable resolves on this Windows host. `where.exe` reports a
 * miss through its exit status (1), so absence is a false answer rather than a
 * failed command; an aborted request stops the probe instead of reading as
 * absence, because the caller's next step is another process launch.
 */
async function windowsCommandExists(
  command: string,
  signal: AbortSignal,
  run: PathOpenerRunner,
): Promise<boolean> {
  try {
    await run('where.exe', [command], signal)
    return true
  } catch {
    // A probe miss is this function's own negative answer; an absent `where.exe`
    // or a refused spawn answers the same way and lands on the cmd fallback.
    signal.throwIfAborted()
    return false
  }
}

/** The PowerShell host to open Windows terminals with, or undefined when none is installed. */
async function firstWindowsPowerShellHost(
  signal: AbortSignal,
  run: PathOpenerRunner,
): Promise<string | undefined> {
  for (const host of WINDOWS_POWERSHELL_HOSTS) {
    if (await windowsCommandExists(host, signal, run)) return host
  }
  return undefined
}

/**
 * Open one Windows-resolvable directory in a new Windows terminal window.
 *
 * PowerShell leads, and `cmd.exe` is used only where no PowerShell resolves.
 * `start` is what gives the shell a console window of its own: a console child
 * spawned directly inherits this process's hidden console. Its `/D` hands the
 * directory over as a start directory instead of as a command string for a
 * shell to re-parse.
 */
async function openWindowsTerminal(path: string, signal: AbortSignal, run: PathOpenerRunner): Promise<void> {
  const host = await firstWindowsPowerShellHost(signal, run)
  if (host === undefined) {
    // `cd /d` because the new console starts in this process's own directory.
    await run('cmd.exe', ['/c', 'start', 'cmd', '/k', 'cd /d', path], signal)
    return
  }
  await run('cmd.exe', ['/c', 'start', '', '/D', path, host, '-NoExit'], signal)
}

/** Dispatch one shell-free platform command for the requested open intent. */
async function openNativePathWithIntent(
  path: string,
  signal: AbortSignal,
  intent: PathOpenIntent,
  internals: PathOpenerInternals = {},
): Promise<void> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand
  const env = internals.env ?? process.env
  const wsl = platform === 'linux' && isWsl(internals)

  if (intent === 'terminal') {
    if (platform === 'linux' && wsl) {
      const translated = await run('wslpath', ['-w', path], signal)
      signal.throwIfAborted()
      const windowsPath = translated.stdout.replace(/[\r\n]+$/, '')
      if (windowsPath === '') throw new Error('wslpath returned no Windows path')
      await openWindowsTerminal(windowsPath, signal, run)
      return
    }
    await openTerminalIn(path, signal, platform, run)
    return
  }

  if (!wsl && intent === 'default' && BROWSER_DOCUMENTS.has(extname(path).toLowerCase())
    && await openInBrowser(path, signal, platform, run, env)) return

  if (platform === 'darwin') {
    await run('open', intent === 'text-editor' ? ['-t', path] : [path], signal)
    return
  }

  if (platform === 'win32') {
    await openWindowsPath(path, signal, run)
    return
  }

  if (platform === 'linux') {
    if (wsl) {
      await openWslPath(path, signal, run)
      return
    }
    await run('xdg-open', [path], signal)
    return
  }

  throw new Error(`native path opener is unsupported on ${platform}`)
}

/**
 * Whether {@link openNativePath} plausibly reaches a desktop on this host.
 *
 * macOS and Windows always carry a desktop opener; Linux does when it is WSL
 * (the Windows desktop takes the path) or a display server is announced.
 * A headless or containerised Linux host answers false, which is what lets a
 * surface show a path as text instead of offering a button that would spawn
 * `xdg-open` into nothing.
 * @param internals - platform and environment seam for deterministic tests.
 * @returns true when handing a path to the native opener can work at all.
 */
export function canOpenNativePath(internals: PathOpenerInternals = {}): boolean {
  const platform = internals.platform ?? process.platform
  if (platform === 'darwin' || platform === 'win32') return true
  if (platform !== 'linux') return false
  const env = internals.env ?? process.env
  return isWsl(internals) || present(env.DISPLAY) || present(env.WAYLAND_DISPLAY)
}

/**
 * Open a filesystem path with the operating system's default application, or
 * with the default browser when the path names a document a browser renders.
 * @param path - absolute or host-resolvable path (caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform, environment, and runner hooks for deterministic tests.
 */
export function openNativePath(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  return openNativePathWithIntent(path, signal, 'default', internals)
}

/**
 * Open a text document for editing; macOS bypasses the file-type association
 * so a YAML association with a browser cannot consume the gesture.
 * @param path - absolute or host-resolvable text-document path.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 */
export function openNativeTextFile(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  return openNativePathWithIntent(path, signal, 'text-editor', internals)
}

/**
 * Open a new system terminal window whose initial working directory is the
 * given path. Cross-platform: Windows opens PowerShell 7 or Windows PowerShell
 * 5.1 where either resolves, falling back to `start cmd /k` on a Windows image
 * that carries neither; macOS opens Terminal.app; Linux opens
 * `xdg-terminal-exec` (gnome-terminal fallback); and WSL translates the path to
 * the Windows desktop.
 * @param path - absolute or host-resolvable directory path (caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform, environment, and runner hooks for deterministic tests.
 */
export function openNativeTerminal(
  path: string,
  signal: AbortSignal,
  internals: PathOpenerInternals = {},
): Promise<void> {
  return openNativePathWithIntent(path, signal, 'terminal', internals)
}
