// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ModelPriceGroupPane, type ModelPriceGroupPaneProps } from '../src/client/ModelPriceGroupPane.tsx'
import { ModelPriceGroupRow, type ModelPriceGroupRowProps } from '../src/client/ModelPriceGroupRow.tsx'
import type { PriceGroupState } from '../src/client/model-price-groups.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const MODEL = 'deepseek/deepseek-flash'

const READY: PriceGroupState = {
  status: 'ready',
  model: MODEL,
  groups: [
    { code: 'cheap', name: '经济池', isDefault: true, selected: true },
    { code: 'premium', name: '高级池', isDefault: false, selected: false },
  ],
  pinned: null,
  saving: false,
  error: null,
}

function projection(provider = 'birdcoder') {
  return { lastUsed: null, next: { provider, model: MODEL } }
}

function rowProps(state: PriceGroupState = READY, provider = 'birdcoder'): ModelPriceGroupRowProps {
  return {
    sessionId: 's1' as never,
    useSession: () => undefined,
    useSessions: () => undefined,
    useProjection: () => projection(provider),
    usePriceGroup: (select: (value: PriceGroupState) => unknown) => select(state),
    load: vi.fn(),
    select: vi.fn(async () => null),
    locked: false,
    openPane: vi.fn(),
    dismiss: vi.fn(),
    reportFailure: vi.fn(),
    t: makeTranslate(zh),
  } as unknown as ModelPriceGroupRowProps
}

function paneProps(state: PriceGroupState = READY, provider = 'birdcoder'): ModelPriceGroupPaneProps {
  const base = rowProps(state, provider) as unknown as ModelPriceGroupPaneProps
  return base
}

it('renders nothing for a provider other than the relay route', () => {
  const props = rowProps(READY, 'deepseek-official')
  const view = render(<ModelPriceGroupRow {...props} />)
  expect(screen.queryByRole('menuitem')).toBeNull()
  expect(view.container.textContent).toBe('')
  const empty = { ...props, useProjection: () => undefined }
  view.rerender(<ModelPriceGroupRow {...empty} />)
  expect(screen.queryByRole('menuitem')).toBeNull()
})

it('shows the effective default and opens the picker', () => {
  const props = rowProps()
  render(<ModelPriceGroupRow {...props} />)
  const row = screen.getByRole('menuitem', { name: /模型价格分组/ })
  expect(row.textContent).toBe('模型价格分组经济池')
  expect(row.getAttribute('data-model-menu-pane')).toBe('model-price-group')
  fireEvent.click(row)
  expect(props.openPane).toHaveBeenCalledExactlyOnceWith({ key: 'model-price-group', title: '模型价格分组' })
  expect(props.load).toHaveBeenCalledWith(MODEL)
})

it('shows the pinned group and blocks the picker while locked', () => {
  const props = rowProps({ ...READY, pinned: 'premium' })
  const view = render(<ModelPriceGroupRow {...props} />)
  expect(screen.getByRole('menuitem').textContent).toBe('模型价格分组高级池')
  view.rerender(<ModelPriceGroupRow {...props} locked />)
  const row = screen.getByRole('menuitem')
  expect(row.hasAttribute('disabled')).toBe(true)
  fireEvent.click(row)
  expect(props.openPane).not.toHaveBeenCalled()
})

it('lists the inherited default and every group, checked on the pinned one', () => {
  const props = paneProps({ ...READY, pinned: 'premium' })
  render(<ModelPriceGroupPane {...props} />)
  const options = screen.getAllByRole('menuitemradio')
  expect(options.map(option => option.textContent)).toEqual(['跟随默认分组', '经济池', '高级池'])
  expect(options.map(option => option.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
  expect(screen.getByText('跟随默认分组').closest('button')).toBe(options[0])
  expect(options[2]!.getAttribute('title')).toBe('premium')
})

it('saves the chosen group and dismisses the menu', async () => {
  const props = paneProps()
  render(<ModelPriceGroupPane {...props} />)
  await waitFor(() => { expect(screen.getAllByRole('menuitemradio')).toHaveLength(3) })
  fireEvent.click(screen.getByRole('menuitemradio', { name: '高级池' }))
  await waitFor(() => { expect(props.dismiss).toHaveBeenCalledOnce() })
  expect(props.select).toHaveBeenCalledExactlyOnceWith({ model: MODEL, groupCode: 'premium' })
  expect(props.reportFailure).not.toHaveBeenCalled()
})

it('clears the rule through the inherited row', async () => {
  const props = paneProps({ ...READY, pinned: 'premium' })
  render(<ModelPriceGroupPane {...props} />)
  fireEvent.click(screen.getByRole('menuitemradio', { name: '跟随默认分组' }))
  await waitFor(() => { expect(props.select).toHaveBeenCalledWith({ model: MODEL, groupCode: null }) })
  await waitFor(() => { expect(props.dismiss).toHaveBeenCalledOnce() })
})

it('reports a rejected save through the menu host and stays open', async () => {
  const props = { ...paneProps(), select: vi.fn(async () => 'group is not available to this user') }
  render(<ModelPriceGroupPane {...props} />)
  fireEvent.click(screen.getByRole('menuitemradio', { name: '高级池' }))
  await waitFor(() => { expect(props.reportFailure).toHaveBeenCalledWith(expect.stringContaining('group is not available to this user')) })
  expect(props.dismiss).not.toHaveBeenCalled()
  expect(screen.getAllByRole('menuitemradio').every(option => !option.hasAttribute('disabled'))).toBe(true)
})

it('disables every row while a save is in flight', async () => {
  let settle: (() => void) | undefined
  const props = {
    ...paneProps(),
    select: vi.fn(() => new Promise<string | null>((resolve) => { settle = () => { resolve(null) } })),
  }
  render(<ModelPriceGroupPane {...props} />)
  fireEvent.click(screen.getByRole('menuitemradio', { name: '高级池' }))
  await waitFor(() => { expect(screen.getAllByRole('menuitemradio').every(option => option.hasAttribute('disabled'))).toBe(true) })
  fireEvent.click(screen.getByRole('menuitemradio', { name: '经济池' }))
  expect(props.select).toHaveBeenCalledTimes(1)
  settle?.()
  await waitFor(() => { expect(props.dismiss).toHaveBeenCalledOnce() })
})

it('shows the loading, failed, and empty states', async () => {
  const loading = { ...READY, status: 'loading' as const, groups: [], pinned: null }
  const view = render(<ModelPriceGroupPane {...paneProps(loading)} />)
  expect(screen.getByRole('status').textContent).toBe('正在加载分组…')
  const failed = { ...READY, status: 'failed' as const, groups: [], pinned: null, error: 'offline' }
  const retryProps = paneProps(failed)
  view.rerender(<ModelPriceGroupPane {...retryProps} />)
  expect(screen.getByRole('alert').textContent).toContain('无法加载分组：offline')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(retryProps.load).toHaveBeenCalledWith(MODEL)
  const empty = { ...READY, groups: [] }
  view.rerender(<ModelPriceGroupPane {...paneProps(empty)} />)
  expect(screen.getByRole('status').textContent).toBe('当前模型没有可选分组。')
})

it('reloads when the Session switches to another relay model', () => {
  const props = rowProps()
  const view = render(<ModelPriceGroupRow {...props} />)
  const other = 'anthropic/claude-fable-5-1'
  const next = {
    ...props,
    useProjection: () => ({ lastUsed: null, next: { provider: 'birdcoder', model: other } }),
  }
  view.rerender(<ModelPriceGroupRow {...next} />)
  expect(props.load).toHaveBeenNthCalledWith(1, MODEL)
  expect(props.load).toHaveBeenNthCalledWith(2, other)
})

it('renders nothing when the Session is outside the relay provider', () => {
  const view = render(<ModelPriceGroupPane {...paneProps(READY, 'deepseek-official')} />)
  expect(view.container.textContent).toBe('')
})
