import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ fromWebContents: vi.fn<(contents: unknown) => unknown>() }))

vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: electron.fromWebContents } }))

const { applyDevToolsWindowIcon } = await import('../src/devtools-icon.ts')

const ICON = '/desktop-app/build/icon.png'

/** Renderer double: records the event listeners the module installs. */
function renderer(devtools: unknown = null) {
  const listeners = new Map<string, () => void>()
  const contents = {
    devToolsWebContents: devtools,
    on: vi.fn((name: string, handler: () => void) => {
      listeners.set(name, handler)
      return contents
    }),
  }
  return {
    contents,
    emit: (name: string) => { listeners.get(name)?.() },
    listenerCount: () => listeners.size,
  }
}

function devtoolsWindow(destroyed = false) {
  return { setIcon: vi.fn<(icon: string) => void>(), isDestroyed: () => destroyed }
}

beforeEach(() => { electron.fromWebContents.mockReset() })

describe('development DevTools window icon', () => {
  it('carries the product icon on the undocked DevTools window', () => {
    const devtools = {}
    const window = devtoolsWindow()
    electron.fromWebContents.mockReturnValue(window)
    const { contents } = renderer(devtools)

    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)

    expect(electron.fromWebContents).toHaveBeenCalledExactlyOnceWith(devtools)
    expect(window.setIcon).toHaveBeenCalledExactlyOnceWith(ICON)
  })

  it('leaves the window alone when the build ships no raster', () => {
    const { contents, listenerCount } = renderer({})

    applyDevToolsWindowIcon(contents as unknown as WebContents, undefined)

    expect(listenerCount()).toBe(0)
    expect(electron.fromWebContents).not.toHaveBeenCalled()
  })

  it('applies the icon when the frontend arrives after the DevTools request', () => {
    const window = devtoolsWindow()
    electron.fromWebContents.mockReturnValue(window)
    const { contents, emit } = renderer()

    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)
    expect(window.setIcon).not.toHaveBeenCalled()

    contents.devToolsWebContents = {}
    emit('devtools-opened')

    expect(window.setIcon).toHaveBeenCalledExactlyOnceWith(ICON)
  })

  it('re-applies the icon to a reopened DevTools frontend', () => {
    const first = devtoolsWindow()
    const second = devtoolsWindow()
    electron.fromWebContents.mockReturnValueOnce(first).mockReturnValue(second)
    const { contents, emit } = renderer({})

    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)
    contents.devToolsWebContents = {}
    emit('devtools-opened')

    expect(first.setIcon).toHaveBeenCalledExactlyOnceWith(ICON)
    expect(second.setIcon).toHaveBeenCalledExactlyOnceWith(ICON)
  })

  it('skips a DevTools window that closed before the icon is applied', () => {
    const window = devtoolsWindow(true)
    electron.fromWebContents.mockReturnValue(window)
    const { contents } = renderer({})

    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)

    expect(window.setIcon).not.toHaveBeenCalled()
  })

  it('listens once per Renderer however often the workspace is entered', () => {
    const { contents, listenerCount } = renderer()

    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)
    applyDevToolsWindowIcon(contents as unknown as WebContents, ICON)

    expect(listenerCount()).toBe(1)
  })
})
