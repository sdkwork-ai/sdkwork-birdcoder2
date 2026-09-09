/** LayoutController behavior: the cross-plugin panel-action face. Geometry
 * lives in the entry store (layout-store.spec.ts) — here we assert the
 * delegation contract: attachPanels wiring, the action forwarding, the
 * unwired fail-loud, and re-attach overwriting a stale action set.
 */
import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'
import { DETAILS_DEFAULT, MODE_RAIL_WIDTH, SIDEBAR_DEFAULT } from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'
import type { PanelActions } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    setSidebar: vi.fn(),
    setDetails: vi.fn(),
    toggleSidebar: vi.fn(),
    setNarrow: vi.fn(),
    setMode: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setPanelMode: vi.fn(),
  }
}

describe('LayoutController', () => {
  it('forwards the panel actions to the attached set', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    service.toggleSidebar()
    service.openDetails()
    service.closeDetails()
    service.setSidebarVisible(false)
    service.setSidebarVisible(true)

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.openDetails).toHaveBeenCalledTimes(1)
    expect(panels.closeDetails).toHaveBeenCalledTimes(1)
    // Visible maps to the contract default, hidden to the closed preference
    // (the solver's compact rail — the layout's recoverable minimum).
    expect(panels.setSidebar).toHaveBeenNthCalledWith(1, 0)
    expect(panels.setSidebar).toHaveBeenNthCalledWith(2, SIDEBAR_DEFAULT)
    expect(panels.setDetails).not.toHaveBeenCalled()
  })

  it('fails loud before the root entry wired its actions', () => {
    const service = new LayoutController()
    expect(() => { service.toggleSidebar() }).toThrow(/panel actions not wired/)
    expect(() => { service.openDetails() }).toThrow(/panel actions not wired/)
    expect(() => { service.closeDetails() }).toThrow(/panel actions not wired/)
    expect(() => { service.setSidebarVisible(true) }).toThrow(/panel actions not wired/)
  })

  it('re-attach overwrites the stale action set (entry re-register)', () => {
    const service = new LayoutController()
    const stale = fakePanels()
    const fresh = fakePanels()
    service.attachPanels(stale)
    service.attachPanels(fresh)

    service.toggleSidebar()

    expect(stale.toggleSidebar).not.toHaveBeenCalled()
    expect(fresh.toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('opens the wide-content panel at the half-frame width', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    const width = 1920
    vi.stubGlobal('window', { innerWidth: width })
    try {
      service.openDetailsWide()
    } finally {
      vi.unstubAllGlobals()
    }

    // Ensure open first, then the wide request: half of the frame after the
    // mode rail and the sidebar contract default — the wide panel and the
    // conversation column split the viewport evenly.
    expect(panels.openDetails).toHaveBeenCalledTimes(1)
    expect(panels.setDetails).toHaveBeenCalledWith(
      Math.round((width - MODE_RAIL_WIDTH - SIDEBAR_DEFAULT) / 2),
    )
  })

  it('never opens the wide-content panel below the contract default', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)

    vi.stubGlobal('window', { innerWidth: 800 })
    try {
      service.openDetailsWide()
    } finally {
      vi.unstubAllGlobals()
    }

    expect(panels.openDetails).toHaveBeenCalledTimes(1)
    expect(panels.setDetails).toHaveBeenCalledWith(DETAILS_DEFAULT)
  })
})
