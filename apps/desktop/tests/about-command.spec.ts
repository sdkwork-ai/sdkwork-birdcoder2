/** The desktop About command bridge: one pending request, one renderer announcement. */
import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { ABOUT_BRIDGE, createAboutCommand, type AboutCommandWindow } from '../src/about-command.ts'

interface Handler {
  (event: IpcMainInvokeEvent): unknown
}

function harness(options: { window?: () => AboutCommandWindow | undefined } = {}) {
  const handlers = new Map<string, Handler>()
  const removed: string[] = []
  const ipcMain = {
    handle: (channel: string, handler: Handler) => { handlers.set(channel, handler) },
    removeHandler: (channel: string) => {
      removed.push(channel)
      handlers.delete(channel)
    },
  }
  const window: AboutCommandWindow = {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  }
  const assertSender = vi.fn()
  const command = createAboutCommand({
    ipcMain,
    getWindow: options.window ?? (() => window),
    assertSender,
  })
  return { command, handlers, removed, window, assertSender }
}

function takePending(handlers: Map<string, Handler>): unknown {
  const handler = handlers.get(ABOUT_BRIDGE.takePending)
  if (handler === undefined) throw new Error('About command registered no pending handler')
  return handler({} as IpcMainInvokeEvent)
}

describe('desktop About command', () => {
  it('announces the command and keeps it pending until the page takes it', () => {
    const b = harness()
    b.command.show()
    expect(b.window.webContents.send).toHaveBeenCalledExactlyOnceWith(ABOUT_BRIDGE.openEvent)
    expect(b.window.focus).toHaveBeenCalledOnce()
    expect(takePending(b.handlers)).toBe(true)
    expect(takePending(b.handlers)).toBe(false)
  })

  it('restores a minimized window before showing the dialog', () => {
    const b = harness()
    b.window.isMinimized = () => true
    b.command.show()
    expect(b.window.restore).toHaveBeenCalledOnce()
    expect(b.window.show).toHaveBeenCalledOnce()
    expect(b.window.webContents.send).toHaveBeenCalledWith(ABOUT_BRIDGE.openEvent)
  })

  it('keeps the command pending while the workspace window does not exist', () => {
    const b = harness({ window: () => undefined })
    b.command.show()
    expect(takePending(b.handlers)).toBe(true)
  })

  it('keeps the command pending when the workspace window is closed', () => {
    const b = harness()
    b.window.isDestroyed = () => true
    b.command.show()
    expect(b.window.webContents.send).not.toHaveBeenCalled()
    expect(takePending(b.handlers)).toBe(true)
  })

  it('verifies the sender on every pending read', () => {
    const b = harness()
    takePending(b.handlers)
    takePending(b.handlers)
    expect(b.assertSender).toHaveBeenCalledTimes(2)
  })

  it('detaches the IPC handler on dispose', () => {
    const b = harness()
    b.command.dispose()
    expect(b.removed).toEqual([ABOUT_BRIDGE.takePending])
    expect(b.handlers.has(ABOUT_BRIDGE.takePending)).toBe(false)
  })
})
