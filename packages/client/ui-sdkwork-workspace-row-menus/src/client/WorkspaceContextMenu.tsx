/**
 * Project row context menu: right-click on a workspace header row opens the
 * same entries as the workspace ellipsis menu (rename + danger delete),
 * dispatched through the identical actions. The menu anchors at the pointer
 * position via the portal + getAnchorRect path of the shared Menu primitive
 * (fixed positioning from the rect, viewport-clamped), and closes on outside
 * click, Escape, selection, or scroll — the standard portal lifecycle.
 */
import { useState } from 'react'
import {
  IconEditOutline16, IconTrashOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceRowMenuActions } from './contract/slots.ts'

/**
 * Right-click surface handed to the project row: attach `onContextMenu` to
 * the row element and render the returned node. While closed the component
 * renders nothing; an open menu positions from the captured pointer rect.
 */
export function WorkspaceContextMenu({
  actions, t, children,
}: {
  /** Real-Workspace actions; absent for the ungrouped bucket (no menu shown). */
  actions?: WorkspaceRowMenuActions | undefined
  /** Translate seat of the plugin's namespace. */
  t: (key: string, params?: Record<string, string>) => string
  /** Row content: receives the context-menu wiring to spread on the row. */
  children: (wiring: { onContextMenu: (e: React.MouseEvent) => void }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  if (actions === undefined) {
    return <>{children({ onContextMenu: () => {} })}</>
  }
  return (
    <>
      {children({
        onContextMenu: (e) => {
          e.preventDefault()
          e.stopPropagation()
          // A zero-width rect at the pointer: the portal placement clamps
          // the list into the viewport from this point.
          setAnchorRect(new DOMRect(e.clientX, e.clientY, 0, 0))
          setOpen(true)
        },
      })}
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={[
          { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
          { id: 'delete', label: t('delete.workspace'), icon: <IconTrashOutline16 />, danger: true },
        ]}
        onSelect={(id) => {
          setOpen(false)
          // Same guard as the ellipsis menu: unknown ids never fall into
          // the destructive branch.
          if (id !== 'rename' && id !== 'delete') return
          if (id === 'rename') actions.rename()
          else actions.delete()
        }}
        portal
        getAnchorRect={() => anchorRect}
        anchor={<span style={{ display: 'none' }} />}
      />
    </>
  )
}
