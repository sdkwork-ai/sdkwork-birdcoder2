/**
 * Row-menu contracts shared between the surface owner (ui-workspace) and
 * this plugin. The owner declares the child hole
 * `sidebar.workspaces.rowMenus` (list kind) and dispatches it through
 * `renderSlot` from `ProjectRowItem` / `SessionNodeItem`; this plugin's
 * menu components register into the hole and receive the row payloads plus
 * the owner's action callbacks verbatim.
 */
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkRowMenusKey } from '../locales.ts'

/**
 * Menu row shape the renderer hands to the owner's built-in fallback when a
 * composition wants the stock entries drawn from the plugin-side items.
 * Kept structural (not MenuEntry) so the owner never imports this package.
 */
export interface RowMenuItem {
  id: string
  label: string
  danger?: boolean
}

/** Actions the workspace (project) menu dispatches; identical to the built-in menu's. */
export interface WorkspaceRowMenuActions {
  rename: () => void
  delete: () => void
}

/** Command channel the row drives on right-click; the menu component overrides `open`. */
export interface RowContextMenuChannel {
  open: (x: number, y: number) => void
}

/** Minimal workspaces service face consumed by the path actions (structural slice of IWorkspaces). */
export interface RowMenusWorkspacesPort {
  /** Open a filesystem path with the Host operating system's default application. */
  openPath(path: string): Promise<void>
  /** Open a new system terminal window whose initial working directory is the given path. */
  openTerminal(path: string): Promise<void>
}

/** Minimal session-log download service face (structural slice of SessionLogDownloadController). */
export interface RowMenusSessionLogDownloadPort {
  /** Download one Session's log archive through the shared Host export endpoint. */
  download(sessionId: SessionId): Promise<void>
}

/** Minimal publish-project service face (structural slice of ui-sdkwork-deploy's DeployPublishService). */
export interface RowMenusDeployPublishPort {
  /** Open the publish-project dialog with an optional default source directory. */
  open(options?: { defaultDirectory?: string | undefined }): void
}

/**
 * Owner props share of one workspace row-menu dispatch occurrence. The owner
 * passes the display title and the real-workspace actions (absent for the
 * ungrouped bucket — no menu is rendered there, matching upstream).
 */
export interface WorkspaceRowMenuOwnerProps {
  /** Display title of the workspace row (menu item copy stays title-free). */
  label: string
  /** The workspace's directory path; absent for the ungrouped bucket. */
  cwd?: string | undefined
  /** Real-Workspace actions; absent for the ungrouped bucket (no menu shown). */
  actions?: WorkspaceRowMenuActions | undefined
}

/**
 * Owner props share of one session row-menu dispatch occurrence. The
 * callbacks mirror the built-in menu's dispatch signatures exactly.
 */
export interface SessionRowMenuOwnerProps {
  /** Row identity, forwarded verbatim to every callback. */
  sessionId: SessionId
  /** Session-scoped working directory, when the session carries one. */
  cwd?: string | undefined
  /** Current row title; rename dispatches with it (dialog prefill). */
  title: string
  /** Open the browser-owned session rename dialog (row menu action). */
  onRename: (sessionId: SessionId, currentTitle: string) => void
  /** Fork a session at its last completed turn (row menu action). */
  onFork: (sessionId: SessionId) => void
  /** Archive this session (row menu action; commits without a dialog). */
  onArchive: (sessionId: SessionId) => void
}

// The `sidebar.workspaces.rowMenus` SlotMap declaration lives once, on the
// owner side (ui-workspace contract/slots.ts): a dispatch occurrence carries
// either the workspace or the session payload, and duplicating the
// declaration here would make the slot catalog's documentation ambiguous.

/** The row-menu hole this plugin fills (single-key union; a type alias keeps call sites literal). */
export type WorkspaceRowMenusSlotName = 'sidebar.workspaces.rowMenus'

/**
 * Props of the workspace menu component: the owner share plus the locale
 * seat of the plugin's own namespace. `renderSlot` composes the owner share
 * at dispatch; the registration's `locale` declaration supplies `t`.
 */
export type WorkspaceRowMenuProps = WorkspaceRowMenuOwnerProps & PropsLocale<'sdkwork-workspace-row-menus'> & {
  /** Stable list-slot cell id (declared at registration; re-stated for callers). */
  id?: string | undefined
  /** Workspace id for fork-side extensions that need the target identity. */
  workspaceId?: WorkspaceId | undefined
}

/**
 * Props of the session menu component: the owner share plus the locale seat.
 */
export type SessionRowMenuProps = SessionRowMenuOwnerProps & PropsLocale<'sdkwork-workspace-row-menus'>

/**
 * Build the workspace menu's entry table (rename + danger delete), matching
 * the upstream built-in rows. Exported so the owner's built-in fallback and
 * fork extensions can stay key-compatible.
 */
export function workspaceMenuEntries(t: (key: SdkworkRowMenusKey) => string): readonly RowMenuItem[] {
  return [
    { id: 'rename', label: t('rename') },
    { id: 'delete', label: t('delete.workspace'), danger: true },
  ]
}

/**
 * Build the session menu's entry table (rename + fork + archive), matching
 * the upstream built-in rows.
 */
export function sessionMenuEntries(t: (key: SdkworkRowMenusKey) => string): readonly RowMenuItem[] {
  return [
    { id: 'rename', label: t('rename') },
    { id: 'fork', label: t('menu.fork') },
    { id: 'archive', label: t('menu.archiveSession') },
  ]
}

/** Re-export the shared MenuEntry type for extension authors. */
export type { MenuEntry }
