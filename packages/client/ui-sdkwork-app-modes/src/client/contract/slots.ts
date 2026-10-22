/**
 * App-mode rail slot contract: the keyed entry seat the rail shell declares
 * and every mode module registers into. The rail owns the entry ORDER and
 * the live selection state; each entry owns its glyph, copy, and chrome
 * through its own registration, and receives only the selection facts from
 * the shell.
 */
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One mode entry inside the rail, keyed by its mode id. Declared by this
     * package's 'mode.rail' entry (declaring is claiming); each mode module
     * registers its entry here — the base five from this package, later
     * modes from their own packages. The key space stays runtime-open: the
     * rail renders its ordered ids and a missing entry leaves that cell
     * empty.
     */
    'mode.rail.entry': { kind: 'keyed'; scope: 'root'; owner: ModeRailEntryOwnerProps }
    /**
     * Global-panel shortcuts pinned above the Settings seat. Each list id
     * addresses the matching main panel; the entry owns its button chrome,
     * glyph, and copy, reads the live selection through the standard
     * `usePanelInfo` hook or by comparing the active mode, and opens its
     * surface through the layout service. Rendered outside the entries group
     * because a panel shortcut is not an app mode, and directly above Settings
     * so utility surfaces cluster at the rail's foot.
     */
    'mode.rail.panel': { kind: 'list'; scope: 'root'; owner: ModeRailPanelOwnerProps }
    /**
     * The bottom-pinned settings seat of the rail. Declared by this package's
     * 'mode.rail' entry (declaring is claiming); ui-settings-general
     * registers its trigger row + modal panel here. The rail passes no facts —
     * the seat is always the compact rail form, and the occupant owns its
     * trigger chrome. Rendered outside the entries group so the settings
     * button is not announced as an app mode.
     */
    'mode.rail.settings': { kind: 'single'; scope: 'root'; owner: ModeRailSettingsOwnerProps }
  }
}

/**
 * Owner share of one rail entry: the shell's live selection facts. The entry
 * knows its own mode id through its registration's inject closure, and
 * everything else (glyph, copy, chrome) is the entry's own.
 */
export interface ModeRailEntryOwnerProps {
  /** Whether this entry's mode is the active one (drives the selection styling and the filled glyph). */
  active: boolean
  /** Switch the frame's active mode (no-op when already active). */
  setMode: (mode: AppModeId) => void
}

/**
 * Owner share of the rail's settings seat: no facts cross the shell/occupant
 * boundary — the occupant renders its own trigger chrome against the fixed
 * rail form.
 */
export interface ModeRailSettingsOwnerProps {}

/**
 * Owner share of one rail panel shortcut: the frame's live mode, so a
 * shortcut that opens its own mode page can paint the active cell. Everything
 * else (glyph, copy, chrome, the panel selection it may also read through the
 * standard `usePanelInfo` hook) is the entry's own.
 */
export interface ModeRailPanelOwnerProps {
  /** The frame's active app mode (a shortcut may open a mode page of its own). */
  activeMode: AppModeId
}
