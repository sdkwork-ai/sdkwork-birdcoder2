// @vitest-environment jsdom
/** The shared About content: every read state, both framings, and the copy/link gestures. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AboutContent, type AboutTranslate } from '../src/client/AboutContent.tsx'
import type { AboutInstallationSnapshot, AboutLocalFacts, AboutUnavailableReason } from '../src/client/about-runtime.ts'
import type { AboutInstallationFacts } from '../src/client/installation-facts.ts'
import { SHIPPED_PRODUCT_LINKS } from '../src/client/installation-facts.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with the template placeholders the locale runtime would fill. */
const t: AboutTranslate = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name]
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    return match
  })
}

const LOCAL: AboutLocalFacts = {
  version: '0.2.2-rc.5',
  commit: '0123456789abcdef',
  dirty: true,
  appId: '382429273778032640',
  apiBaseUrl: 'https://api.birdcoder.com',
  environment: 'production',
  appMode: 'web',
}

const APPLICATION: AboutInstallationFacts = {
  appId: '382429273778032640',
  tenantId: '100001',
  organizationId: '0',
  releaseScope: 'TENANT',
  environment: 'testing',
  deploymentMode: 'saas',
  product: {
    name: 'Birdcoder',
    vendor: 'SDKWork',
    appKey: 'birdcoder',
    iconUrl: 'https://cdn.sdkwork.com/apps/sdkwork-birdcoder/assets/icon-1024.png',
    websiteUrl: 'https://www.birdcoder.com',
    supportUrl: 'https://www.birdcoder.com/docs/support',
    privacyPolicyUrl: 'https://www.birdcoder.com/docs/privacy',
    termsOfServiceUrl: 'https://www.birdcoder.com/docs/terms',
  },
}

function state(phase: 'loading' | 'unavailable', reason?: AboutUnavailableReason) {
  if (phase === 'loading') return { phase } as const
  return { phase, reason: reason ?? 'failed' } as const
}

function content(over: Partial<{
  local: AboutLocalFacts
  installation: AboutInstallationSnapshot
  variant: 'page' | 'dialog'
  onRefresh: () => void
}> = {}) {
  const onRefresh = over.onRefresh ?? vi.fn()
  render(
    <AboutContent
      t={t}
      local={over.local ?? LOCAL}
      installation={over.installation ?? { phase: 'ready', application: APPLICATION }}
      variant={over.variant ?? 'page'}
      onRefresh={onRefresh}
    />,
  )
  return { onRefresh }
}

describe('AboutContent', () => {
  it('presents the server-resolved installation identity, links, and copyright', () => {
    content()
    expect(screen.getByText('Birdcoder')).not.toBeNull()
    expect(screen.getByText('v0.2.2-rc.5')).not.toBeNull()
    expect(screen.getByText('已连接平台')).not.toBeNull()
    // The registered app id is the platform's answer only.
    expect(screen.getByText('已注册 App ID')).not.toBeNull()
    expect(screen.getByText('382429273778032640')).not.toBeNull()
    expect(screen.queryByText('本地')).toBeNull()
    expect(screen.queryByText('未获取')).toBeNull()
    expect(screen.getByText('100001')).not.toBeNull()
    expect(screen.getByText('测试环境')).not.toBeNull()
    expect(screen.getByText('云端托管')).not.toBeNull()
    expect(screen.getByText('全租户')).not.toBeNull()
    expect(screen.getByText('应用方式')).not.toBeNull()
    expect(screen.getByText('网页应用')).not.toBeNull()
    expect(screen.getByText('birdcoder')).not.toBeNull()
    expect(screen.getByText('SDKWork')).not.toBeNull()
    const website = screen.getByRole('link', { name: /官网/ })
    expect(website.getAttribute('href')).toBe(APPLICATION.product.websiteUrl)
    expect(website.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/保留所有权利/)).not.toBeNull()
  })

  it('shows a busy app id row and the shipped product facts while the platform read is loading', () => {
    content({ installation: state('loading') })
    expect(screen.getByText('正在读取')).not.toBeNull()
    // The registered id stays a busy row: a local anchor never stands in for it.
    expect(screen.queryByText('382429273778032640')).toBeNull()
    // The release environment keeps the deployment card off the surface.
    expect(screen.queryByText('部署信息')).toBeNull()
    expect(screen.getByText('SDKWORK')).not.toBeNull()
    expect(screen.getByText('birdcoder')).not.toBeNull()
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps local build facts but shows no registered app id when the platform read fails', () => {
    content({ installation: state('unavailable', 'unconfigured') })
    expect(screen.getByText('仅本地信息')).not.toBeNull()
    expect(screen.getByText(/未配置访问令牌/)).not.toBeNull()
    expect(screen.getByText('未获取')).not.toBeNull()
    expect(screen.queryByText('382429273778032640')).toBeNull()
    expect(screen.queryByText('本地')).toBeNull()
    // The version remains a local build fact; deployment diagnostics stay hidden
    // in the release environment.
    expect(screen.getByText('v0.2.2-rc.5')).not.toBeNull()
    expect(screen.queryByText('部署信息')).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).not.toBeNull()
  })

  it('shows the sign-in notice when the launch carries no session', () => {
    content({ installation: state('unavailable', 'unauthenticated') })
    expect(screen.getByText(/登录账号/)).not.toBeNull()
    expect(screen.getByText('未获取')).not.toBeNull()
  })

  it('never presents a product key as the registered app id', () => {
    content({
      local: { ...LOCAL, appId: 'sdkwork-birdcoder' },
      installation: state('unavailable'),
    })
    expect(screen.queryByText('sdkwork-birdcoder')).toBeNull()
    expect(screen.getByText('未获取')).not.toBeNull()
    // The product key row still names the published product, never a fake id.
    expect(screen.getByText('birdcoder')).not.toBeNull()
  })

  it('explains an incomplete platform response', () => {
    content({ installation: state('unavailable', 'invalid') })
    expect(screen.getByText(/应用信息不完整/)).not.toBeNull()
  })

  it('puts the technical failure detail behind a disclosure', () => {
    content({ installation: { phase: 'unavailable', reason: 'failed', detail: 'NetworkError: offline' } })
    expect(screen.getByText(/未能从平台读取应用信息/)).not.toBeNull()
    expect(screen.getByText('技术详情')).not.toBeNull()
    expect(screen.getByText('NetworkError: offline')).not.toBeNull()
  })

  it('routes refresh and retry through the one reload action', () => {
    const page = content()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(page.onRefresh).toHaveBeenCalledTimes(1)
    cleanup()
    const failed = content({ installation: state('unavailable') })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(failed.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows the organization row only for an organization-scoped installation', () => {
    content()
    expect(screen.queryByText('组织')).toBeNull()
    cleanup()
    content({
      installation: {
        phase: 'ready',
        application: { ...APPLICATION, releaseScope: 'ORGANIZATION', organizationId: '42' },
      },
    })
    expect(screen.getByText('组织')).not.toBeNull()
    expect(screen.getByText('42')).not.toBeNull()
    expect(screen.getByText('单组织')).not.toBeNull()
  })

  it.each([
    ['development', '开发环境'],
    ['testing', '测试环境'],
  ] as const)('localizes the %s lifecycle tier', (environment, label) => {
    content({ local: { ...LOCAL, environment }, installation: state('loading') })
    expect(screen.getByText(label)).not.toBeNull()
  })

  it('keeps the deployment card off the release environment', () => {
    content({
      installation: { phase: 'ready', application: { ...APPLICATION, environment: 'production' } },
    })
    expect(screen.queryByText('部署信息')).toBeNull()
    expect(screen.queryByText('服务地址')).toBeNull()
    expect(screen.getByText('应用信息')).not.toBeNull()
    expect(screen.getByText('相关链接')).not.toBeNull()
  })

  it('shows the deployment card outside the release environment', () => {
    content({ installation: { phase: 'ready', application: { ...APPLICATION, environment: 'testing' } } })
    expect(screen.getByText('部署信息')).not.toBeNull()
    expect(screen.getByText('服务地址')).not.toBeNull()
  })

  it('shows an unknown API endpoint outside the release environment', () => {
    content({
      local: { ...LOCAL, environment: 'testing', apiBaseUrl: '' },
      installation: { phase: 'ready', application: { ...APPLICATION, environment: 'testing' } },
    })
    expect(screen.getByText('服务地址')).not.toBeNull()
    expect(screen.getByText('—')).not.toBeNull()
  })

  it.each([
    ['saas', '云端托管'],
    ['private', '专属部署'],
    ['local', '本地运行'],
  ] as const)('localizes the %s deployment mode', (deploymentMode, label) => {
    content({ installation: { phase: 'ready', application: { ...APPLICATION, deploymentMode } } })
    expect(screen.getByText(label)).not.toBeNull()
  })

  it.each([
    ['TENANT', '全租户'],
    ['ORGANIZATION', '单组织'],
    ['USER', '个人'],
  ] as const)('localizes the %s release scope', (releaseScope, label) => {
    content({ installation: { phase: 'ready', application: { ...APPLICATION, releaseScope } } })
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  it.each([
    ['desktop', '桌面应用'],
    ['web', '网页应用'],
  ] as const)('localizes the %s application mode', (appMode, label) => {
    content({ local: { ...LOCAL, appMode } })
    expect(screen.getByText(label)).not.toBeNull()
  })

  it('falls back to the shipped product links before the platform answers', () => {
    content({ installation: state('loading') })
    expect(screen.getByRole('link', { name: /隐私政策/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.privacyPolicyUrl)
    expect(screen.getByRole('link', { name: /服务条款/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.termsOfServiceUrl)
  })

  it('copies the server-resolved app id and reports success locally', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    content()
    const copies = screen.getAllByRole('button', { name: /复制/ })
    fireEvent.click(copies[1])
    expect(writeText).toHaveBeenCalledWith('382429273778032640')
    expect(await screen.findByLabelText('已复制')).not.toBeNull()
    expect(screen.getByText('已复制')).not.toBeNull()
  })

  it('shows the commit with a local-changes marker and copies the full hash', () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    content()
    expect(screen.getByText('0123456（本地改动）')).not.toBeNull()
    const copy = screen.getAllByRole('button', { name: /复制/ }).at(-1)
    fireEvent.click(copy!)
    expect(writeText).toHaveBeenCalledWith('0123456789abcdef')
  })

  it('keeps the product links on the canonical birdcoder.com docs routes', () => {
    content({
      installation: {
        phase: 'ready',
        application: {
          ...APPLICATION,
          product: {
            ...APPLICATION.product,
            websiteUrl: 'https://sdkwork.com/apps/sdkwork-birdcoder',
            supportUrl: 'https://www.birdcoder.com/support',
            privacyPolicyUrl: 'https://www.birdcoder.com/privacy',
            termsOfServiceUrl: 'https://sdkwork.com/terms',
          },
        },
      },
    })
    expect(screen.getByRole('link', { name: /官网/ }).getAttribute('href')).toBe('https://www.birdcoder.com')
    expect(screen.getByRole('link', { name: /支持/ }).getAttribute('href'))
      .toBe('https://www.birdcoder.com/docs/support')
    expect(screen.getByRole('link', { name: /隐私政策/ }).getAttribute('href'))
      .toBe('https://www.birdcoder.com/docs/privacy')
    expect(screen.getByRole('link', { name: /服务条款/ }).getAttribute('href'))
      .toBe('https://www.birdcoder.com/docs/terms')
  })

  it('falls back to the shipped product links for a malformed URL', () => {
    content({
      installation: {
        phase: 'ready',
        application: {
          ...APPLICATION,
          product: { ...APPLICATION.product, websiteUrl: 'not a url' },
        },
      },
    })
    expect(screen.getByRole('link', { name: /官网/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.websiteUrl)
  })

  it('falls back to the shipped product links for empty product URLs', () => {
    content({
      installation: {
        phase: 'ready',
        application: {
          ...APPLICATION,
          product: {
            ...APPLICATION.product,
            websiteUrl: '',
            supportUrl: '',
            privacyPolicyUrl: '',
            termsOfServiceUrl: '',
          },
        },
      },
    })
    expect(screen.getByRole('link', { name: /官网/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.websiteUrl)
    expect(screen.getByRole('link', { name: /支持/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.supportUrl)
    expect(screen.getByRole('link', { name: /隐私政策/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.privacyPolicyUrl)
    expect(screen.getByRole('link', { name: /服务条款/ }).getAttribute('href'))
      .toBe(SHIPPED_PRODUCT_LINKS.termsOfServiceUrl)
  })

  it('omits the local-changes marker for a clean build', () => {
    content({ local: { ...LOCAL, dirty: false } })
    expect(screen.getByText('0123456')).not.toBeNull()
    expect(screen.queryByText('（本地改动）')).toBeNull()
  })

  it('omits the refresh action in the compact dialog framing', () => {
    content({ variant: 'dialog' })
    expect(screen.queryByRole('button', { name: '刷新' })).toBeNull()
    expect(screen.getByText('Birdcoder')).not.toBeNull()
  })

  it('renders unknown build metadata as placeholders', () => {
    content({
      local: { ...LOCAL, version: undefined, commit: undefined, dirty: false, appId: '', apiBaseUrl: '' },
      installation: state('unavailable'),
    })
    expect(screen.getByText('版本未知')).not.toBeNull()
    expect(screen.queryByText('提交')).toBeNull()
    expect(screen.queryByRole('button', { name: /复制/ })).toBeNull()
  })
})
