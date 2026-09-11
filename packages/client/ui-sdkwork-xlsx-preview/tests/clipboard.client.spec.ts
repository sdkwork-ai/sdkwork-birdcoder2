// @vitest-environment jsdom
/** The system clipboard, and how every refusal is absorbed rather than thrown. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readClipboard, writeClipboard } from '../src/client/clipboard.ts'

/** The clipboard jsdom ships with, restored after every spec that replaces it. */
const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

/**
 * Replace the async clipboard with one a spec drives.
 * @param clipboard - the value `navigator.clipboard` reports, or undefined to
 * stand in for a page that has none at all.
 */
function stubClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(navigator, 'clipboard')
  else Object.defineProperty(navigator, 'clipboard', original)
})

describe('writeClipboard', () => {
  it('writes the text it is given', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    await writeClipboard('Region\tNorth')
    expect(writeText).toHaveBeenCalledWith('Region\tNorth')
  })

  it('absorbs a refused write, which a reader can simply retry', async () => {
    stubClipboard({ writeText: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('denied')) })
    await expect(writeClipboard('x')).resolves.toBeUndefined()
  })

  it('absorbs a page that ships no clipboard at all', async () => {
    stubClipboard(undefined)
    await expect(writeClipboard('x')).resolves.toBeUndefined()
  })
})

describe('readClipboard', () => {
  it('reads the text the clipboard holds', async () => {
    stubClipboard({ readText: vi.fn<() => Promise<string>>().mockResolvedValue('Region\tNorth') })
    await expect(readClipboard()).resolves.toBe('Region\tNorth')
  })

  it('reports nothing when the read is refused', async () => {
    stubClipboard({ readText: vi.fn<() => Promise<string>>().mockRejectedValue(new Error('denied')) })
    await expect(readClipboard()).resolves.toBeUndefined()
  })

  it('reports nothing when the page ships no clipboard at all', async () => {
    stubClipboard(undefined)
    await expect(readClipboard()).resolves.toBeUndefined()
  })
})
