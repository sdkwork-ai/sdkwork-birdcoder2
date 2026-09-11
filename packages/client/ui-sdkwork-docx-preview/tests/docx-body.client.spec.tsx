// @vitest-environment jsdom
/** Word body: progress, page rail, zoom controls, pagination, and parse failures. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState } from '@deepseek-ai/dsh-client-sdkwork-office'
import { DocxBody } from '../src/client/DocxBody.tsx'
import type { DocxBodyProps } from '../src/client/DocxBody.tsx'
import { storedFixturePackage } from './docx-fixture.client.ts'
import { buildZip, rels } from './zip-fixture.client.ts'
import { zh } from '../src/client/locales.ts'

/** The relationship kind the package root uses to name the main document part. */
const REL_OFFICE_DOCUMENT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument'

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => PagedViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly index: (tabId: never, index: number) => void
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
  }
}

// jsdom has no object-URL implementation; the parse creates one per media part.
beforeAll(() => {
  URL.createObjectURL = (): string => 'blob:docx/test'
  URL.revokeObjectURL = (): void => {}
})

/**
 * Build the composed props the slot would hand the body.
 * @param data - the file bytes, or undefined for a text-mode delivery.
 * @param store - the paged-view store instance the body reads and writes.
 * @returns the composed body props.
 */
function propsFor(data: Uint8Array | undefined, store: StoreInstance): DocxBodyProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: 'dsh-resource://file/session/s1/report.docx',
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: 'dsh-resource://file/session/s1/report.docx',
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
  } as unknown as DocxBodyProps
}

describe('DocxBody', () => {
  // The suite renders several bodies into one jsdom document; RTL does not
  // auto-clean without test globals, so each spec owns its teardown.
  afterEach(cleanup)

  it('shows a progress line, then the rail and every page the fixture paginates', async () => {
    const data = await storedFixturePackage()
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(data, store)} />)
    expect(screen.getByText('正在解析文档…')).toBeTruthy()

    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    // Nothing is measurable in jsdom, so only the explicit break splits a section.
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('第 1 页预览')
    // The counter is an editable page box: current value plus the total.
    const pageBox = screen.getByLabelText('跳转到页') as HTMLInputElement
    expect(pageBox.value).toBe('1')
    expect(pageBox.parentElement?.textContent).toBe(' / 3')

    fireEvent.click(screen.getByRole('option', { name: '第 3 页' }))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
  })

  it('moves between pages with the buttons and the arrow keys', async () => {
    const data = await storedFixturePackage()
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    expect(screen.getByLabelText<HTMLButtonElement>('上一页').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('下一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })

    const stage = document.querySelector('[data-docx-stage]') as HTMLElement
    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    fireEvent.keyDown(stage, { key: 'PageUp' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1) })
    fireEvent.keyDown(stage, { key: 'Escape' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1)
    // The last page cannot advance further.
    fireEvent.keyDown(stage, { key: 'PageDown' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    fireEvent.keyDown(stage, { key: 'PageDown' })
    fireEvent.keyDown(stage, { key: 'PageDown' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
  })

  it('applies zoom steps and returns to the fitted scale', async () => {
    const data = await storedFixturePackage()
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(data, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('放大'))
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.click(screen.getByLabelText('适应页面'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
  })

  it('explains a legacy binary document and retries on request', async () => {
    const legacy = new Uint8Array(32)
    legacy.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(legacy, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .doc 二进制格式暂不支持预览')
    })
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .doc 二进制格式暂不支持预览')
    })
  })

  it('explains a file that is not a package at all', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(new Uint8Array([1, 2, 3, 4]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .docx 文档。')
    })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(undefined, store)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .docx 文档。')
  })

  it('reports a document part that is not well-formed XML', async () => {
    const bytes = await buildZip([
      { name: 'word/document.xml', text: '<w:document><w:body>' },
      {
        name: '_rels/.rels',
        text: rels(`<Relationship Id="rId1" Type="${REL_OFFICE_DOCUMENT}" Target="word/document.xml"/>`),
        stored: true,
      },
    ])
    const store = defineStore(pagedViewStore).create()
    render(<DocxBody {...propsFor(bytes, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('预览失败：')
    })
  })

  it('releases a document whose parse finished after the body unmounted', async () => {
    const data = await storedFixturePackage()
    const store = defineStore(pagedViewStore).create()
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const view = render(<DocxBody {...propsFor(data, store)} />)
    view.unmount()
    await waitFor(() => { expect(revoke).toHaveBeenCalled() })
    expect(document.querySelector('[data-docx-preview]')).toBeNull()
  })
})
