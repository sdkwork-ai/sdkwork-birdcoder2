import { describe, expect, it, vi } from 'vitest'
import { createThemeSource } from '../src/client/theme-source.ts'

describe('createThemeSource', () => {
  it('seeds the initial snapshot and publishes replacements to live subscribers', () => {
    const source = createThemeSource({ preference: 'system', revision: 0 })
    expect(source.getSnapshot()).toEqual({ preference: 'system', revision: 0 })
    const listener = vi.fn()
    const dispose = source.subscribe(listener)
    source.set({ preference: 'dark', revision: 3 })
    expect(source.getSnapshot()).toEqual({ preference: 'dark', revision: 3 })
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    source.set({ preference: 'light', revision: 4 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot()).toEqual({ preference: 'light', revision: 4 })
  })
})
