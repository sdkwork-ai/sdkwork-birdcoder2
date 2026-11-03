// @vitest-environment jsdom
/**
 * Real composition of the browsing region: the fork shell claims
 * `sidebar.workspaces` and the shipped ui-workspace browser occupies it.
 *
 * The occupant binds its own list through the slot-level scroller hook, so a
 * shell that claims the seat without that inject — or renders it without the
 * hookContext — crashes the entry here instead of in the browser. The rest of
 * the shell's viewport contract (one vertical scroller, `data-sidebar-scrollport`,
 * the rail without it) is asserted against the same render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { apply as applyContextMenu, inject as injectContextMenu } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { apply as applyWorkspace, inject as injectWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { apply, inject } from '../src/client/index.ts'

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

type FrameProps = PropsRenderSlots<'sidebar' | 'shell.leading'>

/** Test-owned frame: the layout frame's only job here is to render the column. */
function Frame({ renderSlot }: FrameProps) {
  return renderSlot('sidebar', { collapsed: false, width: 300, drawer: false })
}

/** Assemble the shell and the browser over the real registry and renderer. */
async function assemble() {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('shortcuts', { register: () => () => {}, catalog: createSnapshotStore([]) } as never)
  runtime.ctx.provide('layout', {
    selectPanel: vi.fn(),
    setMode: vi.fn(),
    setPanelMode: vi.fn(),
    toggleSidebar: vi.fn(),
    beginNavigation: () => new AbortController().signal,
  } as never)
  runtime.releaseWorkspaceSource()
  // The browser's New Session entry reaches the directory picker namespace.
  runtime.remote.provideNamespaces({ directoryPicker: {} })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.mount({ inject: [...injectContextMenu], apply: applyContextMenu })
  const workspace = await runtime.mount({ inject: [...injectWorkspace], apply: applyWorkspace })
  const sidebar = await runtime.mount({ inject: [...inject], apply })
  await runtime.root.declare({
    'sidebar': { kind: 'single', scope: 'root' },
    'shell.leading': { kind: 'single', scope: 'root' },
  } as never, Frame as never)
  const view = runtime.renderRoot()
  return { runtime, view, workspace, sidebar }
}

describe('assembled left column', () => {
  it('renders the browser inside the shared scroll viewport', async () => {
    const { view, runtime } = await assemble()
    try {
      // Neither the seat nor anything inside it fell to a crash face.
      expect(view.container.querySelector('[data-slot-error]')).toBeNull()
      const viewport = view.container.querySelector('[data-sidebar-scrollport]')
      expect(viewport).not.toBeNull()
      // The occupant's collapsed search / list surfaces live inside that viewport.
      const listArea = viewport!.querySelector('[data-sidebar-list-area]')
      expect(listArea).not.toBeNull()
      // The occupant registered through the shell's declaration, not a stand-in.
      expect(runtime.slots.entries('sidebar.workspaces')).toHaveLength(1)
      expect(runtime.slots.spec('sidebar.workspaces')).toMatchObject({ kind: 'single', scope: 'root' })
    } finally {
      await runtime.dispose()
    }
  })
})
