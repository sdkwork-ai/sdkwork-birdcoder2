/**
 * Fork-owned window icon for the BirdCoder desktop shell.
 *
 * The product mark is the BirdCoder bird, never the upstream DeepSeek fish (see
 * AGENTS.md → "BirdCoder brand assets"). `build/icon.png` is generated from the
 * canonical `apps/web/public/favicon.png` by `scripts/generate-icons.mjs` and is
 * the only icon this shell passes to Electron, so an upstream rewrite of the
 * window options cannot silently fall back to the default Electron icon.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Shipped raster, relative to the application directory. */
export const WINDOW_ICON_RELATIVE_PATH = join('build', 'icon.png')

/**
 * Resolve the icon Electron draws for a window on this host.
 *
 * macOS takes the application icon from the signed bundle, so only Windows and
 * Linux windows carry an explicit icon. A packaged application reads it from
 * inside `app.asar`; the unpackaged shell reads it from the application directory.
 * @param appPath - Value of `app.getAppPath()`: the application directory or its asar archive.
 * @param platform - Host platform; defaults to the running process.
 * @returns The icon path, or undefined when this platform does not use one or the shipped raster is absent.
 */
export function resolveWindowIcon(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform === 'darwin') return undefined
  const icon = join(appPath, WINDOW_ICON_RELATIVE_PATH)
  return existsSync(icon) ? icon : undefined
}
