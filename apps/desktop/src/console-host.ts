/**
 * Hidden-console host for the Windows desktop shell. The Electron main is a
 * GUI-subsystem process and never holds a console, so console-subsystem
 * children the harness spawns (pwsh, the bundled-node sandbox runner) would
 * each create a visible console window. Allocating one hidden console at boot
 * gives the whole child chain a console to inherit — the same arrangement an
 * npx/web launch has under a terminal. macOS and Linux need nothing.
 * @module @deepseek-ai/dsh-desktop/console-host
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Win32 ShowWindow nCmdShow value that hides the window. */
const SW_HIDE = 0

/** The koffi surface this host uses (lazy-loaded, win32 only). */
export interface ConsoleHostKoffi {
  load(name: string): {
    func(signature: string): (...args: unknown[]) => unknown
  }
}

/** Injectable surface for tests: the platform and the koffi loader. */
export interface ConsoleHostInternals {
  platform: NodeJS.Platform
  loadKoffi(): ConsoleHostKoffi
}

/** The production internals: this process's platform and the koffi module. */
const defaultInternals: ConsoleHostInternals = {
  platform: process.platform,
  loadKoffi: () => require('koffi') as ConsoleHostKoffi,
}

/**
 * Allocate a hidden console for this process, if none is attached. Children
 * spawned afterwards inherit it instead of creating visible console windows.
 * Safe to call exactly once at boot; a process that already has a console is
 * left untouched.
 * @param internals - platform and koffi loader (tests).
 */
export function installHiddenConsoleHost(
  internals: ConsoleHostInternals = defaultInternals,
): void {
  if (internals.platform !== 'win32') return
  const koffi = internals.loadKoffi()
  const kernel32 = koffi.load('kernel32')
  const user32 = koffi.load('user32')
  const allocConsole = kernel32.func('int AllocConsole(void)') as () => number
  const getConsoleWindow = kernel32.func('void* GetConsoleWindow(void)') as () => unknown
  const showWindow = user32.func('int ShowWindow(void* hWnd, int nCmdShow)') as (hWnd: unknown, nCmdShow: number) => number
  if (allocConsole() === 0) return
  const window = getConsoleWindow()
  if (window !== null && window !== undefined && window !== 0 && window !== 0n) {
    showWindow(window, SW_HIDE)
  }
}
