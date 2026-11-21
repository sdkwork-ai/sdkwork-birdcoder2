// @vitest-environment jsdom
/**
 * The About surfaces through the production slot runtime: the settings section
 * renders the runtime snapshots, and the shell-overlay dialog opens from
 * `ctx.about` with every dismissal path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, stubConfigForm, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { DEFAULT_UI_ENV_SETTINGS, type UiEnvSettings } from '@deepseek-ai/dsh-client-ui-sdkwork-env/src/env-settings.ts'
import { apply, inject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

const sdk = vi.hoisted(() => ({ retrieve: vi.fn() }))

vi.mock('@sdkwork/birdcoder2-app-sdk', () => ({
  createClient: () => ({ installation: { retrieve: sdk.retrieve } }),
}))

const APPLICATION = {
  appId: '382418217538162688',
  tenantId: '100001',
  organizationId: '0',
  releaseScope: 'TENANT',
  environment: 'production',
  deploymentMode: 'saas',
  product: {
    name: 'SDKWork Birdcoder',
    vendor: 'SDKWork',
    appKey: 'sdkwork-birdcoder2',
    iconUrl: 'https://cdn.sdkwork.com/icon.png',
    websiteUrl: 'https://sdkwork.com/apps/sdkwork-birdcoder',
    supportUrl: 'https://sdkwork.com/support',
    privacyPolicyUrl: 'https://sdkwork.com/privacy',
    termsOfServiceUrl: 'https://sdkwork.com/terms',
  },
}

let runtime: SlotTestRuntime | undefined

afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
  sdk.retrieve.mockReset()
  Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
})

interface BenchOptions {
  /** Version the desktop shell reports through the About facts bridge. */
  desktopFacts?: string
}

async function bench(options: BenchOptions = {}) {
  sdk.retrieve.mockResolvedValue(APPLICATION)
  if (options.desktopFacts !== undefined) {
    Reflect.set(globalThis, 'sdkworkDesktop', {
      about: {
        onOpen: () => () => {},
        takePending: async () => false,
        facts: async () => ({ appVersion: options.desktopFacts }),
      },
    })
  }
  const assembly = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(assembly.ctx)
  assembly.ctx.provide('locale', locale)
  assembly.slots.installLocale(locale)
  const form = stubConfigForm<UiEnvSettings>()
  const settings = structuredClone(DEFAULT_UI_ENV_SETTINGS)
  settings.environment = 'production'
  settings.production.apiBaseUrl = 'https://api.birdcoder.com'
  settings.production.accessToken = 'token'
  form.publish({ status: 'ready', value: settings, revision: 1, writable: true })
  assembly.ctx.provide('env', new EnvService(form.scope, {
    environment: 'production',
    production: { apiBaseUrl: 'https://api.birdcoder.com', accessToken: 'token' },
  }))
  assembly.ctx.provide('iam', {
    sessionTokens: () => ({ accessToken: 'token', authToken: 'auth' }),
    onAuthToken: () => () => {},
  } as never)
  await assembly.declare({
    'settings.section': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  })
  await assembly.mount({ inject: [...inject], apply })
  runtime = assembly
  return assembly
}

describe('About surfaces', () => {
  it('renders the settings section from the runtime snapshots', async () => {
    const assembly = await bench()
    await vi.waitFor(() => { expect(sdk.retrieve).toHaveBeenCalledTimes(1) })
    const view = assembly.renderSlot('settings.section', { close: () => {} })
    expect(view.view.getByText('SDKWork Birdcoder')).not.toBeNull()
    expect(view.view.getByText('382418217538162688')).not.toBeNull()
    expect(view.view.getByText('已连接平台')).not.toBeNull()
    expect(view.view.getByText('应用方式')).not.toBeNull()
    expect(view.view.getByText('网页应用')).not.toBeNull()
    view.view.getByRole('button', { name: '刷新' }).click()
    await vi.waitFor(() => { expect(sdk.retrieve).toHaveBeenCalledTimes(2) })
  })

  it('opens the shell-overlay dialog from the About service and dismisses it', async () => {
    const assembly = await bench()
    const view = assembly.renderSlot('shell.overlay', {})
    expect(view.view.queryByRole('dialog')).toBeNull()
    const service = assembly.ctx.get('about')
    if (service === undefined) throw new Error('the About service was not provided')
    act(() => { service.open() })
    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByText('SDKWork Birdcoder')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    act(() => { service.open() })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    act(() => { service.open() })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('dismisses the dialog on a mask click but not on a panel click', async () => {
    const assembly = await bench()
    assembly.renderSlot('shell.overlay', {})
    const service = assembly.ctx.get('about')
    if (service === undefined) throw new Error('the About service was not provided')
    act(() => { service.open() })
    const panel = screen.getByRole('dialog')
    fireEvent.click(panel)
    expect(screen.queryByRole('dialog')).not.toBeNull()
    // A non-Escape key keeps the dialog open.
    fireEvent.keyDown(document, { key: 'a' })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    const host = document.querySelector('[data-about-host]')
    const mask = host?.firstElementChild
    if (!(mask instanceof HTMLElement)) throw new Error('the About mask was not rendered')
    fireEvent.click(mask)
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('restores focus to the opener and tolerates an opener that left the document', async () => {
    const assembly = await bench()
    assembly.renderSlot('shell.overlay', {})
    const service = assembly.ctx.get('about')
    if (service === undefined) throw new Error('the About service was not provided')
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    act(() => { service.open() })
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    act(() => { service.close() })
    expect(document.activeElement).toBe(opener)
    act(() => { service.open() })
    opener.remove()
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('uses the desktop shell version when the page build carries none', async () => {
    const previous = process.env.DSH_CLIENT_VERSION
    delete process.env.DSH_CLIENT_VERSION
    try {
      const assembly = await bench({ desktopFacts: '9.9.9' })
      const view = assembly.renderSlot('settings.section', { close: () => {} })
      await vi.waitFor(() => { expect(view.view.getByText('v9.9.9')).not.toBeNull() })
    } finally {
      if (previous !== undefined) process.env.DSH_CLIENT_VERSION = previous
    }
  })
})
