/**
 * Symbolic platform paths and path helpers.
 *
 * Plans never embed a real user directory: `~` and the Windows environment
 * placeholders keep the generated content deterministic, and the install
 * command expands them in the shell that runs it.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { PlatformPaths, TargetPlatform } from './types.ts'

/**
 * Symbolic path roots for one platform.
 * @param platform - host platform the plan is generated for.
 * @returns the symbolic roots (`~`, `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`).
 */
export function platformPaths(platform: TargetPlatform): PlatformPaths {
  if (platform === 'win32') {
    return {
      platform,
      home: '%USERPROFILE%',
      localAppData: '%LOCALAPPDATA%',
      config: '%APPDATA%',
    }
  }
  if (platform === 'darwin') {
    return {
      platform,
      home: '~',
      localAppData: '~/Library/Application Support',
      config: '~/Library/Application Support',
    }
  }
  return {
    platform,
    home: '~',
    localAppData: '~/.local/share',
    config: '~/.config',
  }
}

/**
 * The platform this browser runs on. Unknown hosts fall back to Linux paths,
 * which is what the Web build's server-side shells use.
 * @returns `win32`, `darwin`, or `linux`.
 */
export function detectPlatform(): TargetPlatform {
  if (typeof navigator === 'undefined') return 'linux'
  const agent = navigator.userAgent
  if (/Windows/i.test(agent)) return 'win32'
  if (/Macintosh|Mac OS X/i.test(agent)) return 'darwin'
  return 'linux'
}

/**
 * Join symbolic path segments with the platform separator.
 * @param base - root path (`~`, `%LOCALAPPDATA%`, or an absolute path).
 * @param segments - child segments.
 * @param platform - separator owner.
 * @returns the joined path.
 */
export function joinPath(base: string, segments: readonly string[], platform: TargetPlatform): string {
  const separator = platform === 'win32' ? '\\' : '/'
  const trimmed = base.replace(/[\\/]+$/, '')
  return [trimmed, ...segments].join(separator)
}

/**
 * Directory part of a symbolic path, keeping the platform separator.
 * @param path - symbolic file path.
 * @param platform - separator owner.
 * @returns the parent directory.
 */
export function dirnamePath(path: string, platform: TargetPlatform): string {
  const separator = platform === 'win32' ? '\\' : '/'
  const index = path.lastIndexOf(separator)
  return index <= 0 ? path : path.slice(0, index)
}

/**
 * Expand a symbolic path for a POSIX shell.
 * @param path - symbolic path (`~` based).
 * @returns the shell expression.
 */
export function posixPath(path: string): string {
  return path.startsWith('~') ? `"$HOME"${path.slice(1)}` : `"${path}"`
}

/**
 * Expand a symbolic path for PowerShell.
 * @param path - symbolic path (`%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`, or `~`).
 * @returns the PowerShell string literal with environment variables expanded by the shell.
 */
export function powershellPath(path: string): string {
  const expanded = path
    .replace(/^~(?=$|[\\/])/, '%USERPROFILE%')
    .replace(/%USERPROFILE%/g, '$env:USERPROFILE')
    .replace(/%LOCALAPPDATA%/g, '$env:LOCALAPPDATA')
    .replace(/%APPDATA%/g, '$env:APPDATA')
  return `"${expanded}"`
}

/**
 * Literal path for display and downloads: the symbolic path with backslashes
 * normalised for Windows.
 * @param path - symbolic path.
 * @param platform - separator owner.
 * @returns the display path.
 */
export function displayPath(path: string, platform: TargetPlatform): string {
  return platform === 'win32' ? path.replace(/\//g, '\\') : path
}
