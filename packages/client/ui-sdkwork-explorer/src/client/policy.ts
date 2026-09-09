/** Durable open-mode policy over the explorer settings namespace. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_FILE_OPEN_MODE, DEFAULT_LINK_OPEN_MODE, FILE_OPEN_FIELD, LINK_OPEN_FIELD,
  type ExplorerOpenMode, type ExplorerSettings,
} from '../explorer-settings.ts'

/** Reactive resolution of one open-mode kind. */
export type OpenModeSubject = 'file' | 'link'

/**
 * How an unhandled mode falls through at the gesture boundary — mirrors the
 * listener contract in {@link ../client/bus.ts | bus.ts}: `native` passes the
 * gesture through to the historical behavior, everything else claims it.
 */
export type RouteDecision = 'tab' | 'chooser' | 'pass'

/**
 * Route one configured open mode at the gesture boundary.
 * @param mode - configured open mode.
 * @returns `tab` (open in the explorer), `chooser` (ask bubble), or `pass`
 * (let the caller's default behavior run).
 */
export function routeOpen(mode: ExplorerOpenMode): RouteDecision {
  if (mode === 'native') return 'pass'
  return mode === 'ask' ? 'chooser' : 'tab'
}

/** Memory-only stand-in used when the settings scope service is absent. */
const memoryScope = (): SettingsScope<ExplorerSettings> => ({
  getSnapshot: () => ({
    status: 'unavailable',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'memory',
  }),
  subscribe: () => () => {},
  mutate: async () => {},
  set: async () => {},
  unset: async () => {},
})

/** Live open-mode preferences consumed by the explorer listener and Settings row. */
export class OpenModePolicy {
  /** Reactive current file mode; defaults to the built-in pane. */
  readonly file: SnapshotStore<ExplorerOpenMode> = createSnapshotStore(DEFAULT_FILE_OPEN_MODE)
  /** Reactive current link mode; defaults to the built-in pane. */
  readonly link: SnapshotStore<ExplorerOpenMode> = createSnapshotStore(DEFAULT_LINK_OPEN_MODE)

  /**
   * @param host - durable explorer settings scope (memory stand-in when absent).
   */
  constructor(private readonly host: SettingsScope<ExplorerSettings> = memoryScope()) {
    host.subscribe(() => { this.adopt() })
    this.adopt()
  }

  /** Publish and persist one explicit user choice. */
  set(subject: OpenModeSubject, mode: ExplorerOpenMode): void {
    const store = subject === 'file' ? this.file : this.link
    if (store.getSnapshot() === mode) return
    store.set(mode)
    void this.host.set(subject === 'file' ? FILE_OPEN_FIELD : LINK_OPEN_FIELD, mode)
  }

  /** Adopt the latest accepted Host section without writing it back. */
  private adopt(): void {
    const section = this.host.getSnapshot().value
    if (section === undefined) return
    if (this.file.getSnapshot() !== section.fileOpen) this.file.set(section.fileOpen)
    if (this.link.getSnapshot() !== section.linkOpen) this.link.set(section.linkOpen)
  }
}
