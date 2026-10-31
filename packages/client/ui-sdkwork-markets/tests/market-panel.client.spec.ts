/**
 * marketPanel: the optional `market` control ledger the page binds. The
 * market is a profile plugin, so the ledger must accept only the contract
 * revision this page renders, keep the published value reference-stable, and
 * withdraw it when the providing plugin goes away — otherwise the live panel
 * would flicker or the install affordance could outlive a market that loaded.
 */
import { describe, expect, it, vi } from 'vitest'
import { MARKET_CONTROL_VERSION, asMarketControl, createMarketPanelSource } from '../src/client/marketPanel.ts'

describe('marketPanel', () => {
  it('accepts only the understood contract', () => {
    expect(MARKET_CONTROL_VERSION).toBe(1)
    expect(asMarketControl(undefined)).toBeUndefined()
    expect(asMarketControl('dshmarket')).toBeUndefined()
    const render = (): null => null
    // A future revision is not rendered against this page's props.
    expect(asMarketControl({ version: 2, render })).toBeUndefined()
    // A value without the panel builder is not a control.
    expect(asMarketControl({ version: 1 })).toBeUndefined()
    expect(asMarketControl({ version: 1, render })).toMatchObject({ version: 1 })
  })

  it('publishes a control once, keeps it stable, and withdraws it', () => {
    const source = createMarketPanelSource()
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    expect(source.getSnapshot()).toBeUndefined()

    const render = (): null => null
    source.attach({ version: 1, render })
    const published = source.getSnapshot()
    expect(published).toBeDefined()
    expect(listener).toHaveBeenCalledTimes(1)

    // Re-publishing the same control is not a change: the snapshot identity
    // must survive, or every subscriber would re-render on an unchanged fact.
    source.attach(published)
    expect(listener).toHaveBeenCalledTimes(1)

    // A value outside the contract leaves the published control alone.
    source.attach({ version: 9 })
    expect(source.getSnapshot()).toBe(published)
    expect(listener).toHaveBeenCalledTimes(1)

    source.detach()
    expect(source.getSnapshot()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)

    // Withdrawing nothing is not a change either.
    source.detach()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    source.attach({ version: 1, render })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
