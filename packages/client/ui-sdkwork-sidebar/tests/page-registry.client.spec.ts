// @vitest-environment jsdom
/** The left column's page registry: registration, ordering, disposal, title
 * resolution and change notification. Pure service behavior — the shell's
 * rendering of the rows is covered by `sidebar-pages.client.spec.tsx`. */
import { describe, expect, it, vi } from 'vitest'
import { createSidebarPageRegistry } from '../src/client/service.ts'

const glyph = () => null

describe('createSidebarPageRegistry', () => {
  it('starts empty and keeps one snapshot reference until a page changes', () => {
    const registry = createSidebarPageRegistry()
    const first = registry.getPages()
    expect(first).toEqual([])
    expect(registry.getPages()).toBe(first)
  })

  it('orders pages by order, then registration order', () => {
    const registry = createSidebarPageRegistry()
    registry.registerPage({ id: 'b', title: 'Bee', order: 20, icon: glyph, open: () => {} })
    registry.registerPage({ id: 'a', title: 'Ay', icon: glyph, open: () => {} })
    registry.registerPage({ id: 'c', title: 'See', order: 20, icon: glyph, open: () => {} })
    expect(registry.getPages().map(page => page.id)).toEqual(['a', 'b', 'c'])
  })

  it('notifies subscribers and replaces the snapshot on register and dispose', () => {
    const registry = createSidebarPageRegistry()
    const listener = vi.fn()
    const off = registry.subscribe(listener)
    const before = registry.getPages()
    const dispose = registry.registerPage({ id: 'a', title: 'Ay', icon: glyph, open: () => {} })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(registry.getPages()).not.toBe(before)
    dispose()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(registry.getPages()).toEqual([])
    off()
    registry.registerPage({ id: 'b', title: 'Bee', icon: glyph, open: () => {} })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('rejects empty and duplicate ids', () => {
    const registry = createSidebarPageRegistry()
    expect(() => registry.registerPage({ id: '  ', title: 'X', icon: glyph, open: () => {} }))
      .toThrow('id must not be empty')
    registry.registerPage({ id: 'a', title: 'Ay', icon: glyph, open: () => {} })
    expect(() => registry.registerPage({ id: 'a', title: 'Other', icon: glyph, open: () => {} }))
      .toThrow('already registered')
  })

  it('resolves function titles at read time and again on refreshTitles', () => {
    const registry = createSidebarPageRegistry()
    let language = 'zh'
    registry.registerPage({ id: 'a', title: () => (language === 'zh' ? '页面' : 'Page'), icon: glyph, open: () => {} })
    expect(registry.getPages()[0]?.title).toBe('页面')
    language = 'en'
    registry.refreshTitles()
    expect(registry.getPages()[0]?.title).toBe('Page')
  })

  it('ignores a stale disposer for an id that was re-registered', () => {
    const registry = createSidebarPageRegistry()
    const disposeFirst = registry.registerPage({ id: 'a', title: 'First', icon: glyph, open: () => {} })
    disposeFirst()
    const page = { id: 'a', title: 'Second', icon: glyph, open: () => {} }
    registry.registerPage(page)
    disposeFirst()
    expect(registry.getPages().map(entry => entry.title)).toEqual(['Second'])
  })
})
