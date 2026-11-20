/**
 * Host-path helpers for the access-token initializer. The browser half never
 * owns a path library: paths arrive from the Host directory bridge already
 * absolute and native (POSIX or Windows), so joining must keep whatever
 * separator the Host used instead of guessing one platform.
 */

/**
 * Join one Host-native absolute base path with relative child segments.
 *
 * Segments may themselves carry `/` or `\` (the surface profile paths are
 * declared with `/`), and traversal or absolute segments are rejected so a
 * computed token path can never escape the application root the row named.
 * @param base - absolute Host path of the application root.
 * @param segments - relative child segments, `/`- or `\`-separated.
 * @returns the joined absolute Host path.
 */
export function joinHostPath(base: string, ...segments: string[]): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  let result = base.replace(/[\\/]+$/u, '')
  for (const segment of segments) {
    for (const part of segment.split(/[\\/]+/u)) {
      if (part === '' || part === '.') continue
      if (part === '..') throw new Error(`refusing a path segment that escapes the application root: ${segment}`)
      result += separator + part
    }
  }
  return result
}

/**
 * Base name of a Host-native absolute path.
 * @param path - absolute Host path.
 * @returns the final path segment.
 */
export function basenameOf(path: string): string {
  if (typeof path !== 'string') return ''
  const segments = path.split(/[\\/]+/u).filter(segment => segment !== '')
  return segments[segments.length - 1] ?? path
}

/**
 * Whether a workspace directory is an SDKWork project directory.
 *
 * The row-menu entry is offered only for these directories: the initializer
 * reads and writes an SDKWork application root's committed profile files, so
 * every other project keeps a menu with no SDKWork verb.
 * @param path - workspace directory path.
 * @returns true when the directory name starts with `sdkwork-`.
 */
export function isSdkworkProjectDirectory(path: string): boolean {
  return basenameOf(path).toLowerCase().startsWith('sdkwork-')
}
