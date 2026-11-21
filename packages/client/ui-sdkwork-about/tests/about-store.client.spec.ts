/** The About dialog store: one shared visibility fact and its two writes. */
import { describe, expect, it } from 'vitest'
import { createAboutStore } from '../src/client/about-store.ts'

describe('createAboutStore', () => {
  it('starts closed and toggles through its declared actions', () => {
    const instance = createAboutStore().create()
    expect(instance.store.getSnapshot()).toEqual({ open: false })
    instance.actions.open()
    expect(instance.store.getSnapshot()).toEqual({ open: true })
    instance.actions.close()
    expect(instance.store.getSnapshot()).toEqual({ open: false })
  })
})
