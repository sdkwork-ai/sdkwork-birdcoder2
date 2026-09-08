/**
 * Workspace (project) and session row menus: the plugin-owned twins of the
 * built-in menus in ui-workspace's ProjectRowItem / SessionNodeItem, plus
 * right-click support and the SDKWork path/export actions. Behavior contract
 * kept verbatim:
 * - the trigger stops row-click propagation (no group toggle on open);
 * - the list renders through a portal with pointer-leave grace (row hover
 *   cards would otherwise clip or steal the pointer);
 * - the delete row carries the danger styling;
 * - unknown ids leave before the dispatch so a future menu row cannot
 *   inherit the destructive branch as an else fallback.
 *
 * Right-click interaction: the row forwards the pointer position through
 * the `contextMenu` command channel (the component overrides `open` at
 * mount); the same entry rows then open at the pointer instead of the
 * trigger. Trigger-open and context-open are mutually exclusive open modes
 * on one state slot, so flipping one closes the other. The open state is
 * reported through `onMenuOpenChange` either way (hover-card suppression).
 *
 * Path/export actions degrade gracefully when their service or data is
 * absent: a row without a working directory (the ungrouped bucket, or a
 * session with no cwd) disables the folder/copy/terminal rows, and a missing
 * injected service keeps the corresponding action a no-op.
 */
import { useEffect, useRef, useState } from 'react'
import {
  IconArchiveOutline20, IconBranchOutline16, IconCodeOutline16, IconCopyOutline16,
  IconDownloadOutline16, IconEditOutline16, IconEllipsisOutline16, IconFolderOpenOutline16,
  IconLinkOutline16, IconTrashOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  RowContextMenuChannel, RowMenusDeployPublishPort, RowMenusSessionLogDownloadPort,
  RowMenusWorkspacesPort, SessionRowMenuOwnerProps, WorkspaceRowMenuActions,
  WorkspaceRowMenuOwnerProps,
} from './contract/slots.ts'

/** Shared row-menu action services (injected; absent degrades the rows to no-ops). */
export interface RowMenuActionsServices {
  workspaces?: RowMenusWorkspacesPort | undefined
  sessionLogDownload?: RowMenusSessionLogDownloadPort | undefined
  deployPublish?: RowMenusDeployPublishPort | undefined
}

/** One path/export/copy action invocation that must not throw out of the menu. */
type Run = () => Promise<void> | void

/**
 * Run one menu action, swallowing failures so a host error never throws out
 * of a click. Both async rejections and synchronous throws are contained:
 * `Promise.resolve(run()).catch` alone leaks a synchronous throw from `run()`
 * out of the dispatch (the resolution wraps the call, it does not protect it).
 */
function runAction(run: Run): void {
  try {
    void Promise.resolve(run()).catch(() => {})
  } catch {
    // A synchronous throw from `run()` must never escape the menu click.
  }
}

/** Rocket glyph for the publish-project row (self-contained, currentColor). */
function RocketIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8.00001 0.666626C5.33334 0.666626 3.00001 1.66663 1.00001 4.33329L4.66668 5.66663L5.33334 7.33329L1.33334 9.66663L3.00001 12.6666C4.66668 11.3333 6.00001 10.6666 7.33334 10.6666L9.66668 11.3333L11.3333 7.33329L12.3333 3.66663C11.3333 1.99996 10.00001 0.666626 8.00001 0.666626ZM8.00001 5.33329C8.73639 5.33329 9.33334 5.93025 9.33334 6.66663C9.33334 7.403 8.73639 7.99996 8.00001 7.99996C7.26363 7.99996 6.66668 7.403 6.66668 6.66663C6.66668 5.93025 7.26363 5.33329 8.00001 5.33329Z"
        fill="currentColor"
      />
      <path d="M11.3333 12.3333L9.33334 15.3333L7.33334 11.6666L9.33334 9.66663L11.3333 12.3333Z" fill="currentColor" />
      <path d="M4.33334 0.999963L0.666672 3.33329L3.66667 4.66663L5.33334 3.66663L4.33334 0.999963Z" fill="currentColor" />
    </svg>
  )
}

/**
 * Build the path-related project rows shared by both menus (guarded on cwd +
 * the method the row dispatches). The `workspaces` service face the row
 * actions consume is a structural slice of the Host's runtime face: its
 * authoritative contract (`api-workspace-controller`'s `IWorkspaces`) exposes
 * no `openPath`/`openTerminal`, so those methods are present only when the
 * concrete provider is the full runtime face. A row is enabled only when the
 * exact method it dispatches is actually a function — a provider lacking the
 * method (the react-free controller, a test double) degrades the row to
 * disabled instead of crashing on click.
 */
function buildPathRows(
  cwd: string | undefined,
  workspaces: RowMenusWorkspacesPort | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): MenuEntry[] {
  const hasCwd = cwd !== undefined && cwd !== ''
  return [
    {
      id: 'openFolder',
      label: t('menu.openFolder'),
      icon: <IconFolderOpenOutline16 />,
      disabled: !hasCwd || typeof workspaces?.openPath !== 'function',
    },
    {
      id: 'copyPath',
      label: t('menu.copyPath'),
      icon: <IconCopyOutline16 />,
      disabled: !hasCwd,
    },
    {
      id: 'openTerminal',
      label: t('menu.openTerminal'),
      icon: <IconCodeOutline16 />,
      disabled: !hasCwd || typeof workspaces?.openTerminal !== 'function',
    },
  ]
}

/**
 * The path-action dispatch shared by both menus. `openPath`/`openTerminal`
 * are not part of the `workspaces` service's authoritative contract, so the
 * dispatch guards the exact method before invoking it — a provider without
 * the method (or without the service at all) makes the action a no-op rather
 * than throwing `workspaces.openPath is not a function` out of the click.
 */
function dispatchPathAction(
  id: string, cwd: string | undefined,
  workspaces: RowMenusWorkspacesPort | undefined,
): void {
  if (cwd === undefined || cwd === '') return
  if (id === 'openFolder' && typeof workspaces?.openPath === 'function') {
    runAction(() => workspaces.openPath(cwd))
  }
  if (id === 'openTerminal' && typeof workspaces?.openTerminal === 'function') {
    runAction(() => workspaces.openTerminal(cwd))
  }
  if (id === 'copyPath') runAction(() => writeClipboard(cwd))
}

/**
 * Workspace menu body. The menu items derive from the locale seat; the
 * dispatch mirrors the built-in implementation exactly.
 */
export function WorkspaceRowMenu({
  label, cwd, actions, onMenuOpenChange, t, iconButtonClassName, contextMenu, workspaces,
  deployPublish,
}: WorkspaceRowMenuOwnerProps & RowMenuActionsServices & {
  /** Report open-state flips so the owner can suppress its hover card. */
  onMenuOpenChange?: ((open: boolean) => void) | undefined
  /** Translate seat of the plugin's namespace. */
  t: (key: string, params?: Record<string, string>) => string
  /** Row-styled trigger class supplied by the owner's stylesheet. */
  iconButtonClassName: string
  /** Command channel the row drives on right-click (overridden here). */
  contextMenu?: RowContextMenuChannel | undefined
}) {
  const [open, setOpen] = useState(false)
  const [contextRect, setContextRect] = useState<DOMRect | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  if (actions === undefined) return null
  const setOpenAndReport = (next: boolean): void => {
    setOpen(next)
    onMenuOpenChange?.(next)
  }
  const items: MenuEntry[] = [
    ...buildPathRows(cwd, workspaces, t),
    ...(deployPublish !== undefined
      ? [{ id: 'publish', label: t('menu.publishProject'), icon: <RocketIcon /> }]
      : []),
    { id: 'separator-path', type: 'separator' },
    { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
    { id: 'delete', label: t('delete.workspace'), icon: <IconTrashOutline16 />, danger: true },
  ]
  const dispatch = (id: string): void => {
    setOpenAndReport(false)
    setContextRect(null)
    dispatchPathAction(id, cwd, workspaces)
    if (id === 'publish') deployPublish?.open({ defaultDirectory: cwd })
    if (id === 'rename') actions.rename()
    if (id === 'delete') actions.delete()
  }
  // Right-click channel: the row calls open(x, y); the menu opens at that
  // pointer position showing the same entry rows as the trigger. The open
  // flip rides the same report channel as the trigger path.
  useEffect(() => {
    if (contextMenu === undefined) return
    contextMenu.open = (x: number, y: number): void => {
      setContextRect(new DOMRect(x, y, 0, 0))
      setOpenAndReport(true)
    }
  })
  return (
    <>
      <Menu
        open={open && contextRect === null}
        onClose={() => { setOpenAndReport(false) }}
        items={items}
        onSelect={dispatch}
        portal
        closeOnPointerLeave
        anchor={(
          <button
            type="button"
            className={iconButtonClassName}
            aria-label={t('actions.workspace.aria', { name: label })}
            onClick={(e) => { e.stopPropagation(); setOpenAndReport(!openRef.current) }}
          >
            <IconEllipsisOutline16 />
          </button>
        )}
      />
      {/* Right-click opens the same rows at the pointer (a zero-width
          synthetic rect drives the portal placement, viewport-clamped). */}
      <Menu
        open={open && contextRect !== null}
        onClose={() => { setOpenAndReport(false); setContextRect(null) }}
        items={items}
        onSelect={dispatch}
        portal
        getAnchorRect={() => contextRect}
        anchor={<span style={{ display: 'none' }} />}
      />
    </>
  )
}

/**
 * Session row menu: the plugin-owned twin of the built-in menu in
 * ui-workspace's SessionNodeItem, plus right-click support and the SDKWork
 * session actions (copy session id, export session log). Same contract:
 * portal + grace, trigger stops propagation, and every dispatch forwards
 * the row id/title verbatim.
 */
export function SessionRowMenu({
  sessionId, title, cwd, onRename, onFork, onArchive, onMenuOpenChange, t, iconButtonClassName,
  contextMenu, workspaces, sessionLogDownload, deployPublish,
}: SessionRowMenuOwnerProps & RowMenuActionsServices & {
  /** Report open-state flips so the owner can suppress its hover card. */
  onMenuOpenChange?: ((open: boolean) => void) | undefined
  /** Translate seat of the plugin's namespace. */
  t: (key: string, params?: Record<string, string>) => string
  /** Row-styled trigger class supplied by the owner's stylesheet. */
  iconButtonClassName: string
  /** Command channel the row drives on right-click (overridden here). */
  contextMenu?: RowContextMenuChannel | undefined
}) {
  const [open, setOpen] = useState(false)
  const [contextRect, setContextRect] = useState<DOMRect | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const setOpenAndReport = (next: boolean): void => {
    setOpen(next)
    onMenuOpenChange?.(next)
  }
  const items: MenuEntry[] = [
    ...buildPathRows(cwd, workspaces, t),
    { id: 'separator-path', type: 'separator' },
    { id: 'copySessionId', label: t('menu.copySessionId'), icon: <IconLinkOutline16 /> },
    { id: 'exportSessionLog', label: t('menu.exportSessionLog'), icon: <IconDownloadOutline16 /> },
    ...(deployPublish !== undefined
      ? [{ id: 'publish', label: t('menu.publishProject'), icon: <RocketIcon /> }]
      : []),
    { id: 'separator-session', type: 'separator' },
    { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
    { id: 'fork', label: t('menu.fork'), icon: <IconBranchOutline16 /> },
    // 20-native glyph in the menu's 16px icon slot (Menu.module.css .itemIcon).
    { id: 'archive', label: t('menu.archiveSession'), icon: <IconArchiveOutline20 size={16} /> },
  ]
  const dispatch = (id: string): void => {
    setOpenAndReport(false)
    setContextRect(null)
    dispatchPathAction(id, cwd, workspaces)
    if (id === 'copySessionId') runAction(() => writeClipboard(String(sessionId)))
    if (id === 'exportSessionLog' && sessionLogDownload !== undefined) {
      runAction(() => sessionLogDownload.download(sessionId))
    }
    if (id === 'publish') deployPublish?.open({ defaultDirectory: cwd })
    if (id === 'rename') onRename(sessionId, title)
    if (id === 'fork') onFork(sessionId)
    if (id === 'archive') onArchive(sessionId)
  }
  // Right-click channel: same pointer-positioned surface as the workspace
  // menu, showing the session rows (rename/fork/archive). The open flip
  // rides the same report channel as the trigger path.
  useEffect(() => {
    if (contextMenu === undefined) return
    contextMenu.open = (x: number, y: number): void => {
      setContextRect(new DOMRect(x, y, 0, 0))
      setOpenAndReport(true)
    }
  })
  return (
    <>
      <Menu
        open={open && contextRect === null}
        onClose={() => { setOpenAndReport(false) }}
        items={items}
        onSelect={dispatch}
        portal
        closeOnPointerLeave
        anchor={(
          <button
            type="button"
            className={iconButtonClassName}
            aria-label={t('actions.session.aria', { name: title })}
            onClick={(e) => { e.stopPropagation(); setOpenAndReport(!openRef.current) }}
          >
            <IconEllipsisOutline16 />
          </button>
        )}
      />
      {/* Right-click opens the same rows at the pointer. */}
      <Menu
        open={open && contextRect !== null}
        onClose={() => { setOpenAndReport(false); setContextRect(null) }}
        items={items}
        onSelect={dispatch}
        portal
        getAnchorRect={() => contextRect}
        anchor={<span style={{ display: 'none' }} />}
      />
    </>
  )
}

/** Type re-exports for extension authors composing over the menu props. */
export type {
  RowContextMenuChannel, RowMenuActionsServices, WorkspaceRowMenuActions,
  WorkspaceRowMenuOwnerProps, SessionRowMenuOwnerProps,
}
