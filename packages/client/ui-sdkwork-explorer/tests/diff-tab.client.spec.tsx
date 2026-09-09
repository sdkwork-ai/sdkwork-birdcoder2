/**
 * The applied-change diff tab: the open-diff gesture routing (claimed into a
 * change tab regardless of the file open-mode policy, malformed hunks left
 * unclaimed), the one-tab-per-file refresh-in-place ledger, the hunk→pair
 * reconstruction, and the tab body's header/fallback/editor boot over a stub
 * Monaco kernel.
 */
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import {
  apply, EXPLORER_OPEN_DIFF_EVENT, inject, isDiffHunks,
  type ExplorerOpenDiffDetail,
} from '../src/client/index.ts'
import { DiffTabView } from '../src/client/DiffTabView.tsx'
import { diffPair } from '../src/client/diffPairModel.ts'
import { ELLIPSIS } from '../src/client/patchReconstruct.ts'
import type { ExplorerSettings } from '../src/explorer-settings.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { TabStore } from '../src/client/tabs.ts'

// The Monaco kernel is stubbed at the loader seam: the tab body must build
// its pre/post-image models, mount the diff editor over them, and swap the
// layout option — the editor internals are Monaco's own contract.
const monacoState = vi.hoisted(() => ({
  models: [] as { language: string; value: string; getValue: () => string; setValue: (v: string) => void }[],
  editors: [] as {
    options: Record<string, unknown>
    updates: Record<string, unknown>[]
    disposed: boolean
    setModel: (model: unknown) => void
    updateOptions: (options: Record<string, unknown>) => void
  }[],
}))
vi.mock('../src/client/monacoSetup.ts', () => ({
  VIEWER_THEME: 'test-theme',
  loadMonaco: async () => ({
    editor: {
      createModel: (text: string, language: string) => {
        const model = {
          language, value: text,
          getValue: () => model.value,
          setValue: (next: string) => { model.value = next },
          dispose: () => {},
        }
        monacoState.models.push(model)
        return model
      },
      createDiffEditor: (_host: HTMLElement, options: Record<string, unknown>) => {
        const editor = {
          options, updates: [] as Record<string, unknown>[], disposed: false,
          model: undefined as unknown,
          setModel(model: unknown) { editor.model = model },
          updateOptions(update: Record<string, unknown>) { editor.updates.push(update) },
          dispose() { editor.disposed = true },
        }
        monacoState.editors.push(editor)
        return editor
      },
    },
  }),
}))

const HUNKS = [
  { path: 'src/app.ts', oldText: 'const a = 1', newText: 'const a = 2' },
] as const

/** Dispatch one diff gesture; @returns whether the explorer claimed it. */
function dispatchDiff(detail: ExplorerOpenDiffDetail): boolean {
  return !document.dispatchEvent(new CustomEvent(EXPLORER_OPEN_DIFF_EVENT, { cancelable: true, detail }))
}

/** Boot the browser half over a real slot tree declaring the details column. */
async function bench(settings: ExplorerSettings | undefined): Promise<{
  ctx: Context
  layout: { openDetailsWide: ReturnType<typeof vi.fn>; closeDetails: ReturnType<typeof vi.fn> }
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'details': { kind: 'single', scope: 'session' } },
  } as never, () => null)

  const layout = { openDetailsWide: vi.fn(), closeDetails: vi.fn() }
  ctx.provide('layout', layout)

  const host = stubSettingsScope<ExplorerSettings>()
  if (settings !== undefined) host.publish({ status: 'ready', value: settings, revision: 1, writable: true })
  ctx.provide('settingsScope', { bind: () => host.scope })

  ctx.provide('uiWorkspace', {
    readTextFile: vi.fn(async () => ''),
  } as never)

  const sessionNamespace = {
    openWorkspacePath: vi.fn(async () => ({ ok: true as const, value: undefined })),
  }
  ctx.provide('remote', { session: sessionNamespace } as never)
  ctx.provide('remote.session', sessionNamespace as never)

  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()

  const fiber = ctx.plugin({ apply, inject, name: 'ui-sdkwork-explorer' })
  await fiber.await()
  onTestFinished(async () => { await fiber.dispose() })
  return { ctx, layout }
}

describe('open-diff gesture routing', () => {
  it('claims well-formed gestures into a change tab, bypassing the file open-mode policy', async () => {
    const { ctx, layout } = await bench({ fileOpen: 'native', linkOpen: 'native' })

    expect(dispatchDiff({ path: 'E:/w/src/app.ts', cwd: 'E:/w', hunks: [...HUNKS] })).toBe(true)
    expect(layout.openDetailsWide).toHaveBeenCalled()
    const snap = ctx.sdkworkExplorer.tabs.getSnapshot()
    expect(snap.tabs).toHaveLength(1)
    expect(snap.tabs[0]?.kind).toBe('diff')
    expect(snap.tabs[0]?.path).toBe('E:/w/src/app.ts')
    expect(snap.tabs[0]?.cwd).toBe('E:/w')
    expect(snap.tabs[0]?.hunks).toEqual([...HUNKS])
    // The change tab announces its body: basename plus the localized diff label.
    expect(snap.tabs[0]?.title.startsWith('app.ts · ')).toBe(true)
  })

  it('refreshes the change tab of one file in place instead of stacking stale tabs', async () => {
    const { ctx } = await bench(undefined)
    const next = [{ path: 'src/app.ts', oldText: null, newText: 'whole file' }]

    dispatchDiff({ path: 'E:/w/src/app.ts', cwd: 'E:/w', hunks: [...HUNKS] })
    dispatchDiff({ path: 'E:/w/src/app.ts', cwd: 'E:/w', hunks: next })
    const snap = ctx.sdkworkExplorer.tabs.getSnapshot()
    expect(snap.tabs).toHaveLength(1)
    expect(snap.tabs[0]?.hunks).toEqual(next)
    expect(snap.activeId).toBe(snap.tabs[0]?.id)
  })

  it('leaves malformed gestures unclaimed so the dispatcher fallback still runs', async () => {
    const { ctx } = await bench(undefined)
    expect(dispatchDiff({ path: 'E:/w/src/app.ts', hunks: [] })).toBe(false)
    expect(dispatchDiff({ path: 'E:/w/src/app.ts', hunks: [{ path: 3, oldText: null, newText: '' } as never] })).toBe(false)
    expect(dispatchDiff({ path: 'E:/w/src/app.ts', hunks: 'x' as never })).toBe(false)
    expect(ctx.sdkworkExplorer.tabs.getSnapshot().tabs).toHaveLength(0)
  })
})

describe('isDiffHunks', () => {
  it('accepts well-formed applied changes only', () => {
    expect(isDiffHunks([{ path: 'a.ts', oldText: null, newText: 'x' }])).toBe(true)
    expect(isDiffHunks([{ path: 'a.ts', oldText: 'old', newText: '' }])).toBe(true)
    expect(isDiffHunks([])).toBe(false)
    expect(isDiffHunks('x')).toBe(false)
    expect(isDiffHunks(undefined)).toBe(false)
    expect(isDiffHunks([{ oldText: null, newText: 'x' }])).toBe(false)
    expect(isDiffHunks([{ path: 'a.ts', oldText: 1, newText: 'x' }])).toBe(false)
    expect(isDiffHunks([{ path: 'a.ts', oldText: null }])).toBe(false)
  })
})

describe('diffPair', () => {
  it('rebuilds both sides of one hunk, an absent old side as the empty pre-image', () => {
    expect(diffPair([{ path: 'a.ts', oldText: 'a\nb', newText: 'a\nc' }]))
      .toEqual({ oldText: 'a\nb', newText: 'a\nc' })
    expect(diffPair([{ path: 'a.ts', oldText: null, newText: 'whole' }]))
      .toEqual({ oldText: '', newText: 'whole' })
  })

  it('keeps the trailing-newline terminator rule so both sides count rows identically', () => {
    expect(diffPair([{ path: 'a.ts', oldText: 'a\n', newText: 'b\n' }]))
      .toEqual({ oldText: 'a', newText: 'b' })
  })

  it('separates scattered hunks with the elided-gap sentinel on both sides', () => {
    const pair = diffPair([
      { path: 'a.ts', oldText: 'one', newText: 'ONE' },
      { path: 'a.ts', oldText: 'two', newText: 'TWO' },
    ])
    expect(pair.oldText.split('\n')).toEqual(['one', ELLIPSIS, 'two'])
    expect(pair.newText.split('\n')).toEqual(['ONE', ELLIPSIS, 'TWO'])
  })
})

describe('TabStore diff refresh', () => {
  it('updates the hunks of a diff tab in place; non-diff reopens keep plain activation', () => {
    const store = new TabStore()
    const first = store.open({
      kind: 'diff', path: '/a.ts', title: 'a.ts',
      hunks: [{ path: 'a.ts', oldText: null, newText: 'x' }],
    })
    const refreshed = store.open({
      kind: 'diff', path: '/a.ts', title: 'a.ts',
      hunks: [{ path: 'a.ts', oldText: 'y', newText: 'z' }],
    })
    expect(refreshed.id).toBe(first.id)
    expect(refreshed.hunks).toEqual([{ path: 'a.ts', oldText: 'y', newText: 'z' }])
    expect(store.getSnapshot().tabs).toHaveLength(1)

    const file = store.open({ kind: 'file', path: '/b.ts', title: 'b.ts' })
    const fileAgain = store.open({ kind: 'file', path: '/b.ts', title: 'b.ts' })
    expect(fileAgain.id).toBe(file.id)
    expect(store.getSnapshot().tabs).toHaveLength(2)
  })
})

describe('DiffTabView', () => {
  const t = makeTranslate(zh)
  // The stub kernel accumulates module-wide; each render test reads its own boot.
  beforeEach(() => {
    monacoState.models = []
    monacoState.editors = []
  })

  function mount(props: {
    path: string
    hunks: readonly { path: string; oldText: string | null; newText: string }[]
    onOpenSource: () => void
  }): { root: Root; host: HTMLDivElement } {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    onTestFinished(() => {
      act(() => { root.unmount() })
      host.remove()
    })
    act(() => {
      root.render(<DiffTabView path={props.path} hunks={props.hunks} t={t} onOpenSource={props.onOpenSource} />)
    })
    return { root, host }
  }

  it('paints the lightweight diff card first, then upgrades to the Monaco diff editor', async () => {
    expect(monacoState.models).toHaveLength(0)
    const { host } = mount({ path: '/w/src/app.ts', hunks: [...HUNKS], onOpenSource: () => {} })

    // Pre-boot: the fallback card carries the change; the editor host is hidden.
    expect(host.querySelector('[data-pending]')).not.toBeNull()
    expect(host.querySelector('[data-pending]')?.textContent).toContain('const a = 1')
    expect(host.querySelector('[hidden]')).not.toBeNull()

    await act(async () => {}) // flush loadMonaco
    const booted = monacoState.editors.at(-1)
    expect(booted).toBeDefined()
    // The pre/post-image pair rides the editor models in the file's language.
    expect(monacoState.models.map(model => model.language)).toEqual(['typescript', 'typescript'])
    expect(monacoState.models[0]?.value).toBe('const a = 1')
    expect(monacoState.models[1]?.value).toBe('const a = 2')
    expect(booted?.options).toMatchObject({ theme: 'test-theme', renderSideBySide: false })
    expect(host.querySelector('[data-pending]')).toBeNull()
    expect(host.querySelector('[hidden]')).toBeNull()
  })

  it('counts the change in the header and offers the split toggle and the source editor', async () => {
    const onOpenSource = vi.fn()
    const { host } = mount({
      path: '/w/src/app.ts',
      hunks: [{ path: 'src/app.ts', oldText: 'keep\nold', newText: 'keep\nnew\nadded' }],
      onOpenSource,
    })
    await act(async () => {})

    expect(host.querySelector('[data-added]')?.textContent).toBe('+3')
    expect(host.querySelector('[data-removed]')?.textContent).toBe('−2')

    const buttons = [...host.querySelectorAll('button')]
    const toggle = buttons.find(button => button.textContent === zh['code.split'])
    expect(toggle).toBeDefined()
    act(() => { toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(monacoState.editors.at(-1)?.updates.at(-1)).toEqual({ renderSideBySide: true })
    expect(toggle?.textContent).toBe(zh['code.inline'])

    const source = buttons.find(button => button.textContent === zh['code.openSource'])
    expect(source).toBeDefined()
    act(() => { source!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onOpenSource).toHaveBeenCalledOnce()
  })

  it('swaps both models in place when the hunks of the tab refresh', async () => {
    const { root, host } = mount({ path: '/w/src/app.ts', hunks: [...HUNKS], onOpenSource: () => {} })
    await act(async () => {})
    expect(monacoState.editors).toHaveLength(1)

    act(() => {
      root.render(<DiffTabView
        path="/w/src/app.ts"
        hunks={[{ path: 'src/app.ts', oldText: 'before', newText: 'after' }]}
        t={t}
        onOpenSource={() => {}}
      />)
    })
    // Same editor, refreshed models: the in-place contract the TabStore drives.
    expect(monacoState.editors).toHaveLength(1)
    expect(monacoState.models[0]?.value).toBe('before')
    expect(monacoState.models[1]?.value).toBe('after')
    expect(host.querySelector('[data-pending]')).toBeNull()
  })

  it('resolves the diff-card labels and the namespace through the explorer dictionaries', () => {
    expect(NS).toBe('explorer')
    expect(en['tab.diff']).toBe('Diff')
    expect(zh['tab.diff']).toBe('变更')
  })
})
