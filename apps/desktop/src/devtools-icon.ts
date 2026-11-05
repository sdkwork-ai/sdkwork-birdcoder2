/**
 * Keep the Renderer DevTools window from taking over the taskbar identity.
 *
 * A development run opens the Renderer DevTools detached, and Chromium creates
 * that window without an icon. Windows paints an icon-less window from its
 * executable, so when the shell picks the DevTools window as the group's
 * representative the taskbar button — and the thumbnails inside it — switches to
 * `electron.exe`'s default mark instead of the shipped raster. Electron maps the
 * DevTools contents to the window that owns them (`BrowserWindow.fromWebContents`
 * returns the product window), so re-applying the raster there as the tools
 * appear leaves the product window as the icon the group resolves to.
 */

import { BrowserWindow, type WebContents } from 'electron'

/**
 * Renderers already listening for `devtools-opened`, so a second entry to the
 * workspace adds no duplicate listener. Membership ends with the WebContents.
 */
const listening = new WeakSet<WebContents>()

/**
 * Re-apply the product raster when one Renderer's DevTools window appears.
 *
 * The icon is applied immediately and again on every `devtools-opened`, because
 * closing and reopening DevTools creates a new frontend window, and the menu
 * item and F12 accelerator toggle it through that event.
 * @param contents - Renderer whose DevTools this launch opens detached.
 * @param icon - Shipped product raster; undefined when the build has none.
 */
export function applyDevToolsWindowIcon(contents: WebContents, icon: string | undefined): void {
  if (icon === undefined) return
  const apply = (): void => {
    const devtools = contents.devToolsWebContents
    if (devtools === null) return
    const window = BrowserWindow.fromWebContents(devtools)
    if (window === null || window.isDestroyed()) return
    window.setIcon(icon)
  }
  if (!listening.has(contents)) {
    listening.add(contents)
    contents.on('devtools-opened', apply)
  }
  apply()
}
