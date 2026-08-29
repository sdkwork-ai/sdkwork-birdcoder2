/**
 * The menu's theme-preference mirror: the appearance submenu's selection
 * reads this source, fed by the `theme/change` event in apply. Kept apart
 * from the shell contract so the mirror's store shape stays a private fact.
 */

import type { ThemePreference } from '@deepseek-ai/dsh-client-ui-theme/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The menu's view of the theme preference (mirrors `theme/change`). */
export interface ThemeMenuSnapshot {
  /** The persisted preference (light/dark/system). */
  preference: ThemePreference
  /** Monotonic theme revision; unchanged snapshots keep the same reference. */
  revision: number
}

/** An observable source plus the apply-world write path. */
export interface ThemeMenuSource {
  /** @returns the current snapshot (stable until the next theme change). */
  getSnapshot(): ThemeMenuSnapshot
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
  /** Publish one mirrored snapshot (the theme/change event's echo). */
  set(snapshot: ThemeMenuSnapshot): void
}

/**
 * Create the menu's theme mirror source.
 * @param initial - the theme preference at apply time.
 * @returns the observable source.
 */
export function createThemeSource(initial: ThemeMenuSnapshot): ThemeMenuSource {
  const store = createSnapshotStore<ThemeMenuSnapshot>({ ...initial })
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    set: (snapshot) => {
      store.update((draft) => {
        draft.preference = snapshot.preference
        draft.revision = snapshot.revision
      })
    },
  }
}
