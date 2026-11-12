// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SignOutConfirmDialog, type SignOutConfirmDialogProps } from '../src/client/SignOutConfirmDialog.tsx'
import type { IamProfileSnapshot } from '../src/client/iam-service.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const PROFILE: IamProfileSnapshot = {
  signedIn: true,
  displayName: 'momo',
  email: 'momo@example.com',
  username: 'momo',
  accountId: 'user-1',
  organizationId: undefined,
  tenantId: undefined,
  accountKind: 'personal',
  appId: 'sdkwork-birdcoder',
  environment: 'production',
  managementCenterUrl: undefined,
  signOutAvailable: true,
  signOutUrl: undefined,
}

function dialog(open = true) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const useStore = vi.fn((selector: (state: { confirmOpen: boolean }) => boolean) => selector({ confirmOpen: open }))
  const useProfile = vi.fn((selector: (snapshot: IamProfileSnapshot) => IamProfileSnapshot) => selector(PROFILE))
  const props = {
    useStore: useStore as never,
    useProfile: useProfile as never,
    onCancel,
    onConfirm,
    t,
  }
  render(<SignOutConfirmDialog {...props as unknown as SignOutConfirmDialogProps} />)
  return { onCancel, onConfirm }
}

describe('SignOutConfirmDialog', () => {
  it('states the consequence and the account before either answer', () => {
    dialog()
    const question = screen.getByRole('dialog')
    expect(question.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('确认退出登录？')).not.toBeNull()
    expect(screen.getByText('退出登录会停止所有正在执行中的任务，请谨慎操作。')).not.toBeNull()
    expect(screen.getByText('当前账号：momo')).not.toBeNull()
  })

  it('dismisses through the cancel action and the corner close', () => {
    const { onCancel } = dialog()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('confirms through the destructive action', () => {
    const { onConfirm } = dialog()
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while closed', () => {
    dialog(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
