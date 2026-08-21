/**
 * Durable desktop-shell preferences owned by the tray. The host-side schema
 * registration lives in the desktop app's main process (apps/desktop/src/tray.ts);
 * this file declares the browser scope's view of the same namespace. The two
 * copies of the namespace/field names are deliberate: the app and the client
 * stack are separate packages with no shared import allowed across the client
 * bundle boundary.
 */

/** Settings namespace owned by the desktop shell (host registration in apps/desktop/src/tray.ts). */
export const DESKTOP_SETTINGS_NAMESPACE = 'desktop'

/** Field carrying the close-to-tray preference in the desktop settings section. */
export const CLOSE_TO_TRAY_FIELD = 'closeToTray'

/** The browser-visible desktop-shell preferences. */
export interface DesktopTraySettings {
  /** Whether closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean
}
