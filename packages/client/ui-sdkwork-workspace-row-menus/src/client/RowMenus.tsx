/**
 * Workspace (project) row menu: the plugin-owned twin of the built-in menu
 * in ui-workspace's ProjectRowItem, plus right-click support. Behavior
 * contract kept verbatim:
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
 */
import { useEffect, useRef, useState } from 'react'
import {
  IconArchiveOutline20, IconBranchOutline16, IconEditOutline16, IconEllipsisOutline16,
  IconTrashOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  RowContextMenuChannel, SessionRowMenuOwnerProps, WorkspaceRowMenuActions,
  WorkspaceRowMenuOwnerProps,
} from './contract/slots.ts'

/**
 * Workspace menu body. The menu items derive from the locale seat; the
 * dispatch mirrors the built-in implementation exactly.
 */
export function WorkspaceRowMenu({
  label, actions, onMenuOpenChange, t, iconButtonClassName, contextMenu,
}: WorkspaceRowMenuOwnerProps & {
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
        items={[
          { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
          { id: 'delete', label: t('delete.workspace'), icon: <IconTrashOutline16 />, danger: true },
        ]}
        onSelect={(id) => {
          setOpenAndReport(false)
          // Unknown ids leave before the dispatch: a future menu row must
          // not inherit the destructive branch as an else fallback.
          if (id !== 'rename' && id !== 'delete') return
          if (id === 'rename') actions.rename()
          else actions.delete()
        }}
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
        items={[
          { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
          { id: 'delete', label: t('delete.workspace'), icon: <IconTrashOutline16 />, danger: true },
        ]}
        onSelect={(id) => {
          setOpenAndReport(false)
          setContextRect(null)
          if (id !== 'rename' && id !== 'delete') return
          if (id === 'rename') actions.rename()
          else actions.delete()
        }}
        portal
        getAnchorRect={() => contextRect}
        anchor={<span style={{ display: 'none' }} />}
      />
    </>
  )
}

/**
 * Session row menu: the plugin-owned twin of the built-in menu in
 * ui-workspace's SessionNodeItem, plus right-click support. Same contract:
 * portal + grace, trigger stops propagation, and every dispatch forwards
 * the row id/title verbatim.
 */
export function SessionRowMenu({
  sessionId, title, onRename, onFork, onArchive, onMenuOpenChange, t, iconButtonClassName, contextMenu,
}: SessionRowMenuOwnerProps & {
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
        items={[
          { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
          { id: 'fork', label: t('menu.fork'), icon: <IconBranchOutline16 /> },
          // 20-native glyph in the menu's 16px icon slot (Menu.module.css .itemIcon).
          { id: 'archive', label: t('menu.archiveSession'), icon: <IconArchiveOutline20 size={16} /> },
        ]}
        onSelect={(id) => {
          setOpenAndReport(false)
          if (id === 'rename') onRename(sessionId, title)
          if (id === 'fork') onFork(sessionId)
          if (id === 'archive') onArchive(sessionId)
        }}
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
        items={[
          { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
          { id: 'fork', label: t('menu.fork'), icon: <IconBranchOutline16 /> },
          { id: 'archive', label: t('menu.archiveSession'), icon: <IconArchiveOutline20 size={16} /> },
        ]}
        onSelect={(id) => {
          setOpenAndReport(false)
          setContextRect(null)
          if (id === 'rename') onRename(sessionId, title)
          if (id === 'fork') onFork(sessionId)
          if (id === 'archive') onArchive(sessionId)
        }}
        portal
        getAnchorRect={() => contextRect}
        anchor={<span style={{ display: 'none' }} />}
      />
    </>
  )
}

/** Type re-exports for extension authors composing over the menu props. */
export type { RowContextMenuChannel, WorkspaceRowMenuActions, WorkspaceRowMenuOwnerProps, SessionRowMenuOwnerProps }
