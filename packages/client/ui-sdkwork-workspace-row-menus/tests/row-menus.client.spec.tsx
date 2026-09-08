// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { SessionRowMenu, WorkspaceRowMenu } from '../src/client/RowMenus.tsx'
import type { RowContextMenuChannel } from '../src/client/RowMenus.tsx'
import { RowMenusEntry } from '../src/client/RowMenusEntry.tsx'
import { WorkspaceContextMenu } from '../src/client/WorkspaceContextMenu.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

const TRIGGER = 'row-trigger-class'

describe('WorkspaceRowMenu (plugin-owned workspace ellipsis menu)', () => {
  it('opens on the ellipsis, dispatches rename and danger delete, and reports open flips', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const onMenuOpenChange = vi.fn()
    render(
      <div>
        <WorkspaceRowMenu
          label="Project"
          actions={{ rename: onRename, delete: onDelete }}
          iconButtonClassName={TRIGGER}
          onMenuOpenChange={onMenuOpenChange}
          t={t}
        />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: '工作区“Project”的操作' })
    expect(trigger.className).toBe(TRIGGER)
    fireEvent.click(trigger)
    expect(onMenuOpenChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('menuitem', { name: '删除工作区' }).className).toMatch(/danger/)
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    // Escape closes without selecting.
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('renders nothing for the ungrouped bucket (no actions)', () => {
    render(
      <div>
        <WorkspaceRowMenu label="未分组" actions={undefined} iconButtonClassName={TRIGGER} t={t} />
      </div>,
    )
    expect(screen.queryByRole('button', { name: /工作区/ })).toBeNull()
  })
})

describe('SessionRowMenu (plugin-owned session ellipsis menu)', () => {
  it('dispatches rename with the current title, fork, and archive without opening the session', () => {
    const onRename = vi.fn()
    const onFork = vi.fn()
    const onArchive = vi.fn()
    const onOpen = vi.fn()
    render(
      // The row click would open the session; the menu trigger must stop it.
      <div onClick={onOpen}>
        <SessionRowMenu
          sessionId={'s1' as never}
          title="One"
          onRename={onRename}
          onFork={onFork}
          onArchive={onArchive}
          iconButtonClassName={TRIGGER}
          t={t}
        />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: '会话“One”的操作' })
    fireEvent.click(trigger)
    expect(onOpen).not.toHaveBeenCalled()
    // Archive is not destructive: no danger styling.
    expect(screen.getByRole('menuitem', { name: '归档会话' }).className).not.toMatch(/danger/)
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledWith('s1', 'One')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: '分叉会话' }))
    expect(onFork).toHaveBeenCalledWith('s1')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: '归档会话' }))
    expect(onArchive).toHaveBeenCalledWith('s1')
    expect(onRename).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('RowMenusEntry (the list-slot dispatch component)', () => {
  it('routes session payloads to the session menu', () => {
    const onRename = vi.fn()
    render(
      <RowMenusEntry
        sessionId={'s9' as never}
        title="Nine"
        onRename={onRename}
        onFork={vi.fn()}
        onArchive={vi.fn()}
        iconButtonClassName={TRIGGER}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '会话“Nine”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledWith('s9', 'Nine')
  })

  it('routes workspace payloads to the workspace menu', () => {
    const onDelete = vi.fn()
    render(
      <RowMenusEntry
        label="Project"
        actions={{ rename: vi.fn(), delete: onDelete }}
        iconButtonClassName={TRIGGER}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '工作区“Project”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除工作区' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('renders nothing without a complete payload', () => {
    render(<RowMenusEntry iconButtonClassName={TRIGGER} t={t} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('WorkspaceContextMenu (project-row right-click menu)', () => {
  it('opens at the pointer on contextmenu and dispatches through the same actions', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    render(
      <WorkspaceContextMenu actions={{ rename: onRename, delete: onDelete }} t={t}>
        {({ onContextMenu }) => (
          <div data-testid="project-row" onContextMenu={onContextMenu}>Project</div>
        )}
      </WorkspaceContextMenu>,
    )
    const row = screen.getByTestId('project-row')
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    // jsdom lacks real layout: the portal list renders hidden until placed.
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('suppresses the browser context menu on the row', () => {
    const prevented = vi.fn()
    render(
      <WorkspaceContextMenu actions={{ rename: vi.fn(), delete: vi.fn() }} t={t}>
        {({ onContextMenu }) => (
          <div
            data-testid="project-row"
            onContextMenu={(e) => { onContextMenu(e); prevented(e.defaultPrevented) }}
          >
            Project
          </div>
        )}
      </WorkspaceContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('project-row'))
    expect(prevented).toHaveBeenCalledWith(true)
  })
})

describe('right-click command channel (contextMenu.open)', () => {
  it('WorkspaceRowMenu opens the pointer-positioned list with the same rows on channel open', () => {
    const onRename = vi.fn()
    const onMenuOpenChange = vi.fn()
    const channel: RowContextMenuChannel = { open: () => {} }
    render(
      <div>
        <WorkspaceRowMenu
          label="Project"
          actions={{ rename: onRename, delete: vi.fn() }}
          iconButtonClassName={TRIGGER}
          onMenuOpenChange={onMenuOpenChange}
          contextMenu={channel}
          t={t}
        />
      </div>,
    )
    // No menu before the command.
    expect(screen.queryByRole('menu')).toBeNull()
    // The component overrode channel.open at mount; invoke it. The call
    // flips two state slots, so it needs act() to flush before asserting.
    act(() => { channel.open(140, 90) })
    const menus = screen.getAllByRole('menu')
    expect(menus).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '删除工作区' }).className).toMatch(/danger/)
    // The open flip rides the same report channel as the trigger path.
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(true)
    // Selection dispatches and closes.
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('SessionRowMenu opens the pointer-positioned list on channel open and dispatches', () => {
    const onRename = vi.fn()
    const onFork = vi.fn()
    const channel: RowContextMenuChannel = { open: () => {} }
    render(
      <div>
        <SessionRowMenu
          sessionId={'s1' as never}
          title="One"
          onRename={onRename}
          onFork={onFork}
          onArchive={vi.fn()}
          iconButtonClassName={TRIGGER}
          contextMenu={channel}
          t={t}
        />
      </div>,
    )
    act(() => { channel.open(50, 60) })
    expect(screen.getAllByRole('menuitem', { name: '分叉会话' }).length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getAllByRole('menuitem', { name: '分叉会话' })[0]!)
    expect(onFork).toHaveBeenCalledWith('s1')
  })

  it('trigger-open and context-open are mutually exclusive open modes', () => {
    const channel: RowContextMenuChannel = { open: () => {} }
    render(
      <div>
        <WorkspaceRowMenu
          label="Project"
          actions={{ rename: vi.fn(), delete: vi.fn() }}
          iconButtonClassName={TRIGGER}
          contextMenu={channel}
          t={t}
        />
      </div>,
    )
    // Trigger path first.
    fireEvent.click(screen.getByRole('button', { name: '工作区“Project”的操作' }))
    // Only the trigger-anchored list shows (context list closed).
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    // Escape closes the trigger list, then the channel opens the context list.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    act(() => { channel.open(10, 20) })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })
})
