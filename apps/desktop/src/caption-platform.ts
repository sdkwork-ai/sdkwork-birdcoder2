/** Platform gate for the product caption the main window draws instead of the OS frame. */

/**
 * Whether the main window replaces the OS window frame with the product caption.
 *
 * Both platforms draw the same 40-DIP caption band: the renderer paints it, the
 * application preload marks the document, mounts the Application/Edit entries,
 * and synchronizes the measured palette, and Electron draws the native window
 * controls in a titlebar overlay. macOS keeps its hiddenInset traffic lights and
 * its own top clearance.
 *
 * FORK DIVERGENCE (AGENTS.md, "Linux desktop runtime"): upstream leaves a
 * Linux window framed and menu-barred, which stacks the window title, Electron's
 * native menu row, and the page into a second header — and the native row keeps
 * its light fill in a dark application theme. The gate widens upstream's
 * Windows-only caption instead of adding a second caption implementation.
 * @param platform - operating system hosting Electron.
 * @returns whether this platform's main window draws the caption band.
 */
export function usesProductCaption(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'linux'
}
