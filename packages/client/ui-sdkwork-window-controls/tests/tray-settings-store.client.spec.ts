/** Tray settings row store: init state and the revision-guarded mirror write. */
import { describe, expect, it } from 'vitest'
import { createTraySettingsRowStore } from '../src/client/tray-settings-store.ts'

describe('createTraySettingsRowStore', () => {
  it('initializes to the pre-value state', () => {
    const instance = createTraySettingsRowStore().create()
    expect(instance.getSnapshot()).toEqual({ enabled: undefined, writable: false, revision: -1 })
  })

  it('mirrors a newer scope snapshot and drops stale duplicates', () => {
    const instance = createTraySettingsRowStore().create()
    instance.actions.sync({ enabled: true, writable: true, revision: 0 })
    expect(instance.getSnapshot()).toEqual({ enabled: true, writable: true, revision: 0 })
    // Same or older revision: no write (the initial -1 window is sealed once
    // the first real revision lands).
    instance.actions.sync({ enabled: false, writable: false, revision: 0 })
    expect(instance.getSnapshot().enabled).toBe(true)
    instance.actions.sync({ enabled: false, writable: false, revision: -1 })
    expect(instance.getSnapshot().enabled).toBe(true)
    // A newer revision lands.
    instance.actions.sync({ enabled: false, writable: true, revision: 2 })
    expect(instance.getSnapshot()).toEqual({ enabled: false, writable: true, revision: 2 })
  })
})
