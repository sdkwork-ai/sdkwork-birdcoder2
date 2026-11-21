// @vitest-environment jsdom
/** Apply: the About service, the settings section, the dialog seat, and the desktop command bridge. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubConfigForm, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  DEFAULT_UI_ENV_SETTINGS, type UiEnvSettings,
} from '@deepseek-ai/dsh-client-ui-sdkwork-env/src/env-settings.ts'
import { apply, inject } from '../src/client/index.ts'
import { AboutDialog } from '../src/client/AboutDialog.tsx'
import { AboutSection } from '../src/client/AboutSection.tsx'

usePinnedBrowserLanguages('zh-CN')

const sdk = vi.hoisted(() => ({ retrieve: vi.fn() }))

vi.mock('@sdkwork/birdcoder2-app-sdk', () => ({
  createClient: () => ({ installation: { retrieve: sdk.retrieve } }),
}))

const APPLICATION = {
  appId: 'app_registered',
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

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
  Reflect.deleteProperty(globalThis, 'desktopBridge')
  vi.restoreAllMocks()
  sdk.retrieve.mockReset()
})

function scopeOf(settings: UiEnvSettings) {
  const form = stubConfigForm<UiEnvSettings>()
  form.publish({ status: 'ready', value: settings, revision: 1, writable: true })
  return form.scope
}

interface BenchOptions {
  accessToken?: string
  credentials?: { accessToken: string; authToken: string } | null
  bridge?: unknown
}

/** IAM session face the About read authenticates through. */
function sessionStub(tokens: { accessToken?: string; authToken?: string }) {
  return {
    sessionTokens: () => tokens,
    onAuthToken: () => () => {},
  }
}

async function bench(options: BenchOptions = {}) {
  if (options.bridge !== undefined) Reflect.set(globalThis, 'sdkworkDesktop', options.bridge)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const settings = structuredClone(DEFAULT_UI_ENV_SETTINGS)
  settings.environment = 'production'
  settings.production.apiBaseUrl = 'https://api.birdcoder.com'
  settings.production.accessToken = options.accessToken ?? 'token'
  ctx.provide('env', new EnvService(scopeOf(settings), {
    environment: 'production',
    production: { apiBaseUrl: 'https://api.birdcoder.com', accessToken: options.accessToken ?? 'token' },
  }))
  const credentials = options.credentials === undefined
    ? { accessToken: 'token', authToken: 'auth' }
    : options.credentials
  ctx.provide('iam', (credentials === null
    ? sessionStub({})
    : sessionStub(credentials)) as never)
  const slots = ctx.get('slots')
  if (slots === undefined) throw new Error('the slot registry was not mounted')
  slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, slots }
}

describe('ui-sdkwork-about apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the About section after every feature page', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const b = await bench()
    const entry = b.slots.entries('settings.section').find(candidate => candidate.component === AboutSection)
    expect(entry).toBeDefined()
    expect(entry!.options).toMatchObject({ id: 'about', order: 1000 })
    expect(resolveSlotLabel(entry!.options.label)).toBe('关于')
  })

  it('seats the About dialog on the shell overlay layer', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const b = await bench()
    expect(b.slots.entries('shell.overlay').some(candidate => candidate.component === AboutDialog)).toBe(true)
  })

  it('provides the About service and reads the installation with the signed-in session credentials', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const b = await bench()
    const service = b.ctx.get('about')
    if (service === undefined) throw new Error('the About service was not provided')
    await vi.waitFor(() => { expect(sdk.retrieve).toHaveBeenCalledTimes(1) })
    const options = sdk.retrieve.mock.calls[0]?.[0] as { signal?: AbortSignal } | undefined
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    service.open()
    service.close()
    service.refresh()
    await vi.waitFor(() => { expect(sdk.retrieve).toHaveBeenCalledTimes(2) })
  })

  it('does not read the platform while signed out', async () => {
    const b = await bench({ credentials: null })
    expect(b.ctx.get('about')).toBeDefined()
    expect(sdk.retrieve).not.toHaveBeenCalled()
  })

  it('opens the dialog from the desktop About command and takes a pending request once', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const handlers: (() => void)[] = []
    const onOpen = vi.fn((handler: () => void) => {
      handlers.push(handler)
      return () => { handlers.splice(handlers.indexOf(handler), 1) }
    })
    const takePending = vi.fn(async () => true)
    await bench({ bridge: { about: { onOpen, takePending } } })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(takePending).toHaveBeenCalledTimes(1)
    handlers[0]()
    // A live command consumes the pending flag it also serves.
    await vi.waitFor(() => { expect(takePending).toHaveBeenCalledTimes(2) })
  })

  it('logs a desktop About command that cannot consume its pending flag', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handlers: (() => void)[] = []
    const takePending = vi.fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('handler missing'))
    await bench({
      bridge: {
        about: {
          onOpen: (handler: () => void) => {
            handlers.push(handler)
            return () => {}
          },
          takePending,
        },
      },
    })
    handlers[0]()
    await vi.waitFor(() => { expect(error).toHaveBeenCalledWith(expect.stringContaining('was not consumed'), expect.any(Error)) })
  })

  it('logs a desktop bridge that cannot report its pending request', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const takePending = vi.fn(() => Promise.reject(new Error('handler missing')))
    await bench({ bridge: { about: { onOpen: () => () => {}, takePending } } })
    await vi.waitFor(() => { expect(error).toHaveBeenCalledWith(expect.stringContaining('desktop About'), expect.any(Error)) })
  })

  it('logs a desktop facts bridge that cannot report the version', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await bench({
      bridge: {
        about: {
          onOpen: () => () => {},
          takePending: async () => false,
          facts: () => Promise.reject(new Error('no facts')),
        },
      },
    })
    await vi.waitFor(() => { expect(error).toHaveBeenCalledWith(expect.stringContaining('desktop facts'), expect.any(Error)) })
  })

  it('ignores a partial or absent desktop bridge', async () => {
    sdk.retrieve.mockResolvedValue(APPLICATION)
    await bench({ bridge: { about: { onOpen: () => () => {} } } })
    await bench({ bridge: {} })
    await bench({ bridge: { about: { onOpen: () => () => {}, takePending: async () => false } } })
    await bench()
    expect(sdk.retrieve).toHaveBeenCalled()
  })
})
