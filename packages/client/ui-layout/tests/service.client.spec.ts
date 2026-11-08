import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import { SIDEBAR_DEFAULT } from '../src/client/columns.ts'
import type { AppModeId } from '../src/client/modes.ts'
import type { MainPanelId, PanelActions } from '../src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    selectPanel: vi.fn(),
    retainMainPanels: vi.fn(),
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    setViewportWidth: vi.fn(),
    setRightbar: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
    setMode: vi.fn(),
    setPanelMode: vi.fn(),
  }
}

/** The panel-selection source a controller is constructed with. */
function panelInfo() {
  return createSnapshotStore({ activePanelId: null })
}

/** The rail-selection source the root entry hands the controller. */
function railMode(): ReturnType<typeof createSnapshotStore<AppModeId>> {
  return createSnapshotStore<AppModeId>('code')
}

/** A controller over the given actions, with both view sources at their boot values. */
function controller(panels: PanelActions, hasMainPanel: (id: MainPanelId) => boolean = () => true): LayoutController {
  return new LayoutController(panels, hasMainPanel, panelInfo(), railMode())
}

describe('LayoutController', () => {
  it('forwards right column transitions to the constructor-supplied actions', () => {
    const panels = fakePanels()
    const service = controller(panels)

    service.openRightbar(true, false)
    service.openRightbar(true, true)
    service.openRightbar(false, true)
    service.closeRightbar()

    expect(panels.openRightbar).toHaveBeenNthCalledWith(1, true, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(2, true, true)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(3, false, true)
    expect(panels.closeRightbar).toHaveBeenCalledTimes(1)
    // The drag width stays the frame's own business, never the caller's.
    expect(panels.setRightbar).not.toHaveBeenCalled()
  })

  it('can toggle the sidebar immediately after construction', () => {
    const panels = fakePanels()
    const service = controller(panels)

    service.toggleSidebar()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
  })

  it('forwards panel selection and returning to the Conversation without changing geometry', () => {
    const panels = fakePanels()
    const service = controller(panels)
    const panelId = 'panel-a' as MainPanelId
    service.selectPanel(panelId)
    service.selectPanel(panelId)
    service.selectPanel(null)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(1, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(2, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(3, null)
    expect(panels.toggleSidebar).not.toHaveBeenCalled()
    expect(panels.openRightbar).not.toHaveBeenCalled()
    expect(panels.closeRightbar).not.toHaveBeenCalled()
  })

  it('keeps separately constructed controllers bound to their own instances', () => {
    const first = fakePanels()
    const second = fakePanels()
    const firstService = controller(first)
    const secondService = controller(second)
    firstService.toggleSidebar()
    expect(first.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(second.toggleSidebar).not.toHaveBeenCalled()
    secondService.closeRightbar()
    expect(first.closeRightbar).not.toHaveBeenCalled()
    expect(second.closeRightbar).toHaveBeenCalledTimes(1)
  })

  it('rejects an absent main entry without changing selection or cancelling pending navigation', () => {
    const panels = fakePanels()
    const present = new Set(['panel-a'])
    const service = controller(panels, id => present.has(id))
    service.selectPanel('panel-a' as MainPanelId)
    const navigation = service.beginNavigation()
    present.delete('panel-a')
    expect(() => { service.selectPanel('panel-a' as MainPanelId) }).toThrow('main panel "panel-a" is not registered')
    expect(panels.selectPanel).toHaveBeenCalledOnce()
    expect(navigation.aborted).toBe(false)
    service.selectPanel(null)
    expect(navigation.aborted).toBe(true)
  })

  it('maps setSidebarVisible onto the persisted preference, the mode actions onto the rail state', () => {
    const panels = fakePanels()
    const service = controller(panels)

    service.setSidebarVisible(false)
    service.setSidebarVisible(true)
    // Visible maps to the contract default, hidden to the closed preference
    // (the solver's compact rail — the layout's recoverable minimum).
    expect(panels.setSidebar).toHaveBeenNthCalledWith(1, 0)
    expect(panels.setSidebar).toHaveBeenNthCalledWith(2, SIDEBAR_DEFAULT)
    service.setMode('video')
    service.openPanel('markets')
    service.closePanel()
    expect(panels.setMode).toHaveBeenNthCalledWith(1, 'video')
    expect(panels.setPanelMode).toHaveBeenNthCalledWith(1, 'markets')
    expect(panels.setPanelMode).toHaveBeenNthCalledWith(2, undefined)
  })

  it('exposes the rail selection as the same observable the frame renders from', () => {
    const mode = railMode()
    const service = new LayoutController(fakePanels(), () => true, panelInfo(), mode)
    expect(service.mode.getSnapshot()).toBe('code')
    const listener = vi.fn()
    const off = service.mode.subscribe(listener)
    mode.set('assistant')
    expect(service.mode.getSnapshot()).toBe('assistant')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    mode.set('video')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('supersedes asynchronous navigation on another request, any valid selection, and disposal', () => {
    const service = controller(fakePanels())
    const first = service.beginNavigation()
    const second = service.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    service.selectPanel('panel-a' as MainPanelId)
    expect(second.aborted).toBe(true)
    const repeated = service.beginNavigation()
    service.selectPanel('panel-a' as MainPanelId)
    expect(repeated.aborted).toBe(true)
    const pending = service.beginNavigation()
    service.dispose()
    expect(pending.aborted).toBe(true)
    service.dispose()
  })
})
