import { describe, expect, it, vi } from 'vitest'
import { installHiddenConsoleHost } from '../src/console-host.ts'

/** A fake koffi loader recording the Win32 calls the host makes. */
function fakeKoffi(allocResult: number, windowHandle: unknown) {
  const allocConsole = vi.fn(() => allocResult)
  const getConsoleWindow = vi.fn(() => windowHandle)
  const showWindow = vi.fn(() => 1)
  const load = vi.fn(() => ({
    func: (signature: string): ((...args: unknown[]) => unknown) => {
      if (signature.includes('AllocConsole')) return allocConsole
      if (signature.includes('GetConsoleWindow')) return getConsoleWindow
      return showWindow
    },
  }))
  return { load, allocConsole, getConsoleWindow, showWindow }
}

describe('installHiddenConsoleHost', () => {
  it('does nothing off Windows', () => {
    const loadKoffi = vi.fn()
    installHiddenConsoleHost({ platform: 'darwin', loadKoffi })
    expect(loadKoffi).not.toHaveBeenCalled()
  })

  it('allocates and hides a console on Windows', () => {
    const koffi = fakeKoffi(1, 0x1234n)
    installHiddenConsoleHost({ platform: 'win32', loadKoffi: () => koffi })
    expect(koffi.allocConsole).toHaveBeenCalledOnce()
    expect(koffi.getConsoleWindow).toHaveBeenCalledOnce()
    expect(koffi.showWindow).toHaveBeenCalledWith(0x1234n, 0)
  })

  it('leaves a process that already has a console untouched', () => {
    const koffi = fakeKoffi(0, 0x1234n)
    installHiddenConsoleHost({ platform: 'win32', loadKoffi: () => koffi })
    expect(koffi.getConsoleWindow).not.toHaveBeenCalled()
    expect(koffi.showWindow).not.toHaveBeenCalled()
  })
})
