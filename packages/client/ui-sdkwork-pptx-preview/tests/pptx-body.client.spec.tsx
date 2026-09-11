// @vitest-environment jsdom
/** PowerPoint body: loading, rail selection, zoom controls, and parse failures. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState } from '@deepseek-ai/dsh-client-sdkwork-office'
import { PptxBody } from '../src/client/PptxBody.tsx'
import type { PptxBodyProps } from '../src/client/PptxBody.tsx'
import { fixtureEntries, storedFixturePackage } from './pptx-fixture.client.ts'
import { buildZip } from './zip-fixture.client.ts'
import { zh } from '../src/client/locales.ts'

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => PagedViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly index: (tabId: never, index: number) => void
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(data: Uint8Array | undefined, store: StoreInstance): PptxBodyProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: 'dsh-resource://file/session/s1/deck.pptx',
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: 'dsh-resource://file/session/s1/deck.pptx',
        signal: controller.signal,
        navigation: { revision: 0 },
      },
    }),
    // The framework binds the declared store source to a subscribing reader;
    // the spec reproduces that binding so re-renders follow store writes.
    useStore: (selector: (state: PagedViewState) => unknown) => useSyncExternalStore(
      store.subscribe,
      () => selector(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as PptxBodyProps
}

describe('PptxBody', () => {
  // The suite renders several bodies into one jsdom document; RTL does not
  // auto-clean without test globals, so each spec owns its teardown.
  afterEach(cleanup)

  it('shows a progress line, then the rail and the selected slide', async () => {
    const data = await storedFixturePackage(2)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    expect(screen.getByText('正在解析演示文稿…')).toBeTruthy()

    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('第 1 页预览')
    expect(screen.getByText('1 / 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: 'Fixture Slide 2' }))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
  })

  it('moves between slides with the buttons and the arrow keys', async () => {
    const data = await storedFixturePackage(3)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    expect((screen.getByLabelText<HTMLButtonElement>('上一页')).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('下一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })

    const stage = document.querySelector('[data-pptx-stage]') as HTMLElement
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    fireEvent.keyDown(stage, { key: 'Escape' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2)
    // The last slide cannot advance further.
    fireEvent.click(screen.getByLabelText('下一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    fireEvent.keyDown(stage, { key: 'PageDown' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3)
  })

  it('applies zoom steps and returns to the fitted scale', async () => {
    const data = await storedFixturePackage(1)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('放大'))
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.click(screen.getByLabelText('适应窗口'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
  })

  it('explains a legacy binary presentation and retries on request', async () => {
    const legacy = new Uint8Array(32)
    legacy.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(legacy, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .ppt 二进制格式暂不支持预览')
    })
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .ppt 二进制格式暂不支持预览')
    })
  })

  it('explains a file that is not a package at all', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(new Uint8Array([1, 2, 3, 4]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .pptx 演示文稿。')
    })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(undefined, store)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .pptx 演示文稿。')
  })

  it('mounts thumbnails only as the shared observer reports them near the rail', async () => {
    const observed: Element[] = []
    class StubObserver {
      observe(target: Element): void { observed.push(target) }
      unobserve(): void { }
      disconnect(): void { }
    }
    vi.stubGlobal('IntersectionObserver', StubObserver)
    try {
      const data = await storedFixturePackage(2)
      const store = defineStore(pagedViewStore).create()
      render(<PptxBody {...propsFor(data, store)} />)
      await waitFor(() => { expect(screen.getAllByRole('option')).toHaveLength(2) })
      // Both thumbnails registered with the observer; neither has a canvas yet.
      expect(observed).toHaveLength(2)
      expect(document.querySelectorAll('[data-pptx-thumbnail-canvas]')).toHaveLength(0)
      // The stage canvas is unaffected: the selected slide always renders.
      expect(document.querySelectorAll('[data-pptx-canvas]')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('steps the zoom with Ctrl+wheel', async () => {
    const data = await storedFixturePackage(1)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    const stage = document.querySelector('[data-pptx-stage]') as HTMLElement
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true }))
    await waitFor(() => {
      expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.1, 5)
    })
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, cancelable: true }))
    await waitFor(() => {
      expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    })
  })

  it('marks a hidden slide in the rail', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('<p:sld ', '<p:sld show="0" ') }
        : entry
    ))
    const data = await buildZip(entries)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    expect(screen.getByText('已隐藏')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Fixture Slide 1 · 已隐藏' })).toBeTruthy()
  })

  it('steps the zoom with the plus, minus, and zero keys', async () => {
    const data = await storedFixturePackage(1)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    const stage = document.querySelector('[data-pptx-stage]') as HTMLElement
    fireEvent.keyDown(stage, { key: '+' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5) })
    fireEvent.keyDown(stage, { key: '-' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5) })
    fireEvent.keyDown(stage, { key: '+' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5) })
    fireEvent.keyDown(stage, { key: '0' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1) })
  })

  it('navigates to the target slide when an internal jump link is clicked', async () => {
    const jump = '<p:sp><p:nvSpPr><p:cNvPr id="97" name="TOC"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="914400"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US">'
      + '<a:hlinkClick r:id="rIdJump" action="ppaction://hlinksldjump"/></a:rPr>'
      + '<a:t>jump ahead</a:t></a:r></a:p></p:txBody></p:sp>'
    const entries = fixtureEntries(2).map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        return { ...entry, text: entry.text.replace('</p:spTree>', `${jump}</p:spTree>`) }
      }
      if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        return {
          ...entry,
          text: entry.text.replace('</Relationships>',
            '<Relationship Id="rIdJump" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide2.xml"/></Relationships>'),
        }
      }
      return entry
    })
    const data = await buildZip(entries)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    // The text renders in the rail thumbnail and the stage; only the stage
    // copy sits under the delegated click handler.
    const anchor = document.querySelector('[data-pptx-stage] a[data-pptx-slide-jump]')
    expect(anchor).not.toBeNull()
    fireEvent.click(anchor as HTMLElement)
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
  })

  it('edits shape text in place through double-click and blur', async () => {
    const data = await storedFixturePackage(1)
    const store = defineStore(pagedViewStore).create()
    const { within } = await import('@testing-library/react')
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    const stage = document.querySelector('[data-pptx-stage]') as HTMLElement
    const title = within(stage).getByText('桃花源记 1')
    fireEvent.doubleClick(title)
    const editor = stage.querySelector('[contenteditable="true"]') as HTMLElement
    expect(editor).not.toBeNull()
    editor.textContent = '编辑后的标题'
    fireEvent.input(editor)
    fireEvent.blur(editor)
    await waitFor(() => { expect(within(stage).getByText('编辑后的标题')).toBeTruthy() })
  })

  it('jumps to the first and last slide with Home and End', async () => {
    const data = await storedFixturePackage(3)
    const store = defineStore(pagedViewStore).create()
    render(<PptxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    const stage = document.querySelector('[data-pptx-stage]') as HTMLElement
    fireEvent.click(screen.getByLabelText('下一页'))
    fireEvent.click(screen.getByLabelText('下一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })

    fireEvent.keyDown(stage, { key: 'Home' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1) })
    fireEvent.keyDown(stage, { key: 'End' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
  })
})
