/**
 * The row-menu list-slot entry component. Split from index.ts because the
 * dispatch renders JSX (menu components) and index.ts stays a plain .ts
 * module like every other plugin entry.
 *
 * The owner share carries both possible payloads; the component picks by
 * presence (session payloads win — rows are either a session row or a
 * workspace header row, never both). The owner additionally supplies the
 * stylesheet trigger class and the menu-open report channel through the
 * same dispatch owner props.
 */
import { SessionRowMenu, WorkspaceRowMenu } from './RowMenus.tsx'
import type { RowContextMenuChannel } from './contract/slots.ts'

export function RowMenusEntry(props: {
  // Workspace payload (absent on session rows).
  label?: string | undefined
  actions?: { rename: () => void; delete: () => void } | undefined
  // Session payload (absent on workspace rows).
  sessionId?: string | undefined
  title?: string | undefined
  onRename?: ((sessionId: string, currentTitle: string) => void) | undefined
  onFork?: ((sessionId: string) => void) | undefined
  onArchive?: ((sessionId: string) => void) | undefined
  // Owner-supplied rendering share.
  iconButtonClassName?: string | undefined
  onMenuOpenChange?: ((open: boolean) => void) | undefined
  // Command channel for right-click opening (the menu components override it).
  contextMenu?: RowContextMenuChannel | undefined
  // Locale seat (registration declares the namespace).
  t?: ((key: string, params?: Record<string, string>) => string) | undefined
}) {
  if (props.sessionId !== undefined) {
    if (props.title === undefined || props.onRename === undefined
      || props.onFork === undefined || props.onArchive === undefined
      || props.iconButtonClassName === undefined) return null
    return (
      <SessionRowMenu
        sessionId={props.sessionId}
        title={props.title}
        onRename={props.onRename}
        onFork={props.onFork}
        onArchive={props.onArchive}
        iconButtonClassName={props.iconButtonClassName}
        onMenuOpenChange={props.onMenuOpenChange}
        contextMenu={props.contextMenu}
        t={props.t ?? (key => key)}
      />
    )
  }
  if (props.label === undefined || props.actions === undefined
    || props.iconButtonClassName === undefined) return null
  return (
    <WorkspaceRowMenu
      label={props.label}
      actions={props.actions}
      iconButtonClassName={props.iconButtonClassName}
      onMenuOpenChange={props.onMenuOpenChange}
      contextMenu={props.contextMenu}
      t={props.t ?? (key => key)}
    />
  )
}
