// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FeedbackDialog, type FeedbackDialogProps } from '../src/client/FeedbackDialog.tsx'
import { zh } from '../src/client/locales.ts'
import type { FeedbackService } from '../src/client/feedback-service.ts'

afterEach(cleanup)

/** Shipped Chinese copy — the component spec asserts user-visible copy. */
const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

function serviceOf() {
  const submit = vi.fn(async () => {})
  return { service: { submit } as unknown as FeedbackService, submit }
}

function dialog(open: boolean, configured = true, service = serviceOf()) {
  const onClose = vi.fn()
  const props = {
    service: service.service,
    onClose,
    useStore: vi.fn((sel: (s: { dialogOpen: boolean }) => boolean) => sel({ dialogOpen: open })),
    useConfigured: vi.fn((sel: (c: boolean) => boolean) => sel(configured)),
    t,
  }
  render(<FeedbackDialog {...props as unknown as FeedbackDialogProps} />)
  return { onClose, ...service }
}

describe('FeedbackDialog', () => {
  it('renders nothing while the dialog is closed (the overlay layer stays click-through)', () => {
    dialog(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the feedback form while open and configured', () => {
    dialog(true)
    const form = screen.getByRole('dialog')
    expect(within(form).getByRole('radiogroup', { name: '反馈类型' })).not.toBeNull()
    expect(within(form).getByRole('textbox', { name: '反馈内容' })).not.toBeNull()
    expect(within(form).getByRole('textbox', { name: '联系方式（选填）' })).not.toBeNull()
    expect(within(form).getByRole('button', { name: '提交反馈' })).not.toBeNull()
  })

  it('renders the configuration notice dialog while open and unconfigured', () => {
    dialog(true, false)
    const form = screen.getByRole('dialog')
    expect(within(form).getByText('未配置反馈服务')).not.toBeNull()
    expect(within(form).queryByRole('textbox')).toBeNull()
  })

  it('switches the feedback type through the radio group', () => {
    dialog(true)
    const form = screen.getByRole('dialog')
    fireEvent.click(within(form).getByRole('radio', { name: '功能建议' }))
    const suggestion = within(form).getByRole('radio', { name: '功能建议' }) as HTMLInputElement
    const bug = within(form).getByRole('radio', { name: '问题反馈' }) as HTMLInputElement
    expect(suggestion.checked).toBe(true)
    expect(bug.checked).toBe(false)
  })

  it('blocks submission for blank content and reports the validation error', () => {
    const { submit } = dialog(true)
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }))
    expect(screen.getByRole('alert').textContent).toContain('请填写反馈内容')
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits the draft through the service and shows the success state', async () => {
    const { submit } = dialog(true)
    const form = screen.getByRole('dialog')
    fireEvent.click(within(form).getByRole('radio', { name: '功能建议' }))
    fireEvent.change(within(form).getByRole('textbox', { name: '反馈内容' }), { target: { value: '  Add a dark mode  ' } })
    fireEvent.change(within(form).getByRole('textbox', { name: '联系方式（选填）' }), { target: { value: 'me@example.com' } })
    fireEvent.click(within(form).getByRole('button', { name: '提交反馈' }))
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledWith({
        type: 'suggestion',
        content: 'Add a dark mode',
        contact: 'me@example.com',
      })
    })
    // The success state replaces the form once the submission resolves.
    await vi.waitFor(() => {
      expect(screen.getByText('感谢你的反馈！')).not.toBeNull()
    })
  })

  it('omits the contact field for a blank contact', async () => {
    const { submit } = dialog(true)
    const form = screen.getByRole('dialog')
    fireEvent.change(within(form).getByRole('textbox', { name: '反馈内容' }), { target: { value: 'hello' } })
    fireEvent.click(within(form).getByRole('button', { name: '提交反馈' }))
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ type: 'bug', content: 'hello' })
    })
  })

  it('reports the generic error on transport failure and keeps the form open', async () => {
    const service = serviceOf()
    service.submit.mockRejectedValueOnce(new Error('network down'))
    dialog(true, true, service)
    const form = screen.getByRole('dialog')
    fireEvent.change(within(form).getByRole('textbox', { name: '反馈内容' }), { target: { value: 'hello' } })
    fireEvent.click(within(form).getByRole('button', { name: '提交反馈' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('提交失败，请稍后重试')
    })
    expect(within(form).getByRole('textbox', { name: '反馈内容' })).not.toBeNull()
  })

  it('reports the unauthorized error on a 401 API rejection', async () => {
    const service = serviceOf()
    service.submit.mockRejectedValueOnce({ status: 401 })
    dialog(true, true, service)
    const form = screen.getByRole('dialog')
    fireEvent.change(within(form).getByRole('textbox', { name: '反馈内容' }), { target: { value: 'hello' } })
    fireEvent.click(within(form).getByRole('button', { name: '提交反馈' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('请先登录 SDKWork 账号后再提交反馈')
    })
  })

  it('closes through the dismiss gesture while idle', () => {
    const { onClose } = dialog(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
