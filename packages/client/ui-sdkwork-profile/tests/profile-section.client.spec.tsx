// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProfileSection, type ProfileSectionComponentProps } from '../src/client/ProfileSection.tsx'
import type { IamProfileSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy — the component spec asserts user-visible copy. */
const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const PERSONAL: IamProfileSnapshot = {
  signedIn: true,
  displayName: 'momo',
  email: 'momo@example.com',
  username: 'momo',
  accountId: 'user-1',
  organizationId: undefined,
  tenantId: '100001',
  accountKind: 'personal',
  appId: 'sdkwork-birdcoder',
  environment: 'production',
  managementCenterUrl: 'https://router.sdkwork.com',
  signOutAvailable: true,
  signOutUrl: 'https://router.sdkwork.com/auth/sign-out',
}

interface Overrides {
  profile?: IamProfileSnapshot
}

/** Render the section with a stubbed profile hook and inject callbacks. */
function section(over: Overrides = {}) {
  const profile = over.profile ?? PERSONAL
  const requestSignOut = vi.fn()
  const signIn = vi.fn()
  const openExternal = vi.fn()
  const useProfile = vi.fn((selector: (snapshot: IamProfileSnapshot) => IamProfileSnapshot) => selector(profile))
  const props = {
    useProfile: useProfile as never,
    requestSignOut,
    signIn,
    openExternal,
    t,
  }
  render(<ProfileSection {...props as unknown as ProfileSectionComponentProps} />)
  return { requestSignOut, signIn, openExternal }
}

describe('ProfileSection', () => {
  it('offers the sign-in entry while signed out', () => {
    const { signIn } = section({ profile: { ...PERSONAL, signedIn: false } })
    expect(screen.getByText('未登录')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '登录 / 注册' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('presents the personal account with its details and linked products', () => {
    const { openExternal } = section()
    // The name and the personal badge each appear in the header and in the
    // account-information rows, so both are matched as a set.
    expect(screen.getAllByText('momo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('个人版').length).toBeGreaterThan(0)
    expect(screen.getAllByText('momo@example.com').length).toBeGreaterThan(0)
    expect(screen.getByText('user-1')).not.toBeNull()
    expect(screen.getByText('production')).not.toBeNull()
    expect(screen.getByText('BirdCoder')).not.toBeNull()
    expect(screen.getByText('Cloud Router')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /前往管理中心/ }))
    expect(openExternal).toHaveBeenCalledWith('https://router.sdkwork.com')
  })

  it('switches to the enterprise tab and explains the personal empty state', () => {
    section()
    fireEvent.click(screen.getByRole('tab', { name: '企业' }))
    expect(screen.getByText('当前为个人版账号')).not.toBeNull()
    expect(screen.queryByText('组织 ID')).toBeNull()
  })

  it('shows the organization and tenant ids for an enterprise session', () => {
    section({
      profile: {
        ...PERSONAL,
        accountKind: 'enterprise',
        organizationId: 'org-1',
        tenantId: 'tenant-9',
        username: '',
      },
    })
    expect(screen.getAllByText('企业版').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: '企业' }))
    expect(screen.getByText('org-1')).not.toBeNull()
    expect(screen.getByText('tenant-9')).not.toBeNull()
  })

  it('routes the footer sign-out button through the confirmation gesture', () => {
    const { requestSignOut } = section()
    fireEvent.click(screen.getByTestId('profile-sign-out'))
    expect(requestSignOut).toHaveBeenCalledTimes(1)
  })

  it('omits the management-center actions without a configured origin', () => {
    section({ profile: { ...PERSONAL, managementCenterUrl: undefined } })
    expect(screen.queryByRole('button', { name: /前往管理中心/ })).toBeNull()
    expect(screen.queryByText('Cloud Router')).toBeNull()
  })
})

describe('profile dictionaries', () => {
  it('ships both locales for every key', async () => {
    const { en } = await import('../src/client/locales.ts')
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})
