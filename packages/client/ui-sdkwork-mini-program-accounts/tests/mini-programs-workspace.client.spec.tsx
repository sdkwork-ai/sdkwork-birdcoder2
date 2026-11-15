// @vitest-environment jsdom
/**
 * The workspace bridge: it mounts the shared `@sdkwork/iam-pc-mini-program`
 * panel under the SDKWork theme and message providers and maps the harness
 * locale onto the panel's catalog tag.
 *
 * The panel's own ledger/form/command behaviour and its copy are covered by the
 * shared package's test suite. This spec stubs the SDKWork component tree — the
 * same boundary `ui-sdkwork-official-accounts` uses — because those packages
 * resolve their own React copy outside the harness's client test aggregate.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import {
  DEFAULT_OPERATOR_CAPABILITIES,
  createMiniProgramController,
  type MiniProgramAccount,
  type MiniProgramCapabilities,
  type MiniProgramController,
  type MiniProgramTransport,
} from '@sdkwork/iam-pc-mini-program'
import {
  MiniProgramsWorkspace,
  toMiniProgramLocale,
} from '../src/client/MiniProgramsWorkspace.tsx'

vi.mock('@sdkwork/ui-pc-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sdkwork/ui-pc-react')>()
  return {
    ...actual,
    SdkworkThemeProvider: ({ children, themeSelection }: {
      children?: ReactNode
      themeSelection?: string
    }) => <div data-selection={themeSelection} data-testid="theme">{children}</div>,
  }
})

vi.mock('@sdkwork/i18n-pc-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sdkwork/i18n-pc-react')>()
  return {
    ...actual,
    SdkworkI18nProvider: ({ children, locale }: {
      children?: ReactNode
      locale?: string
    }) => <div data-locale={locale} data-testid="i18n">{children}</div>,
  }
})

vi.mock('@sdkwork/iam-pc-mini-program', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sdkwork/iam-pc-mini-program')>()
  return {
    ...actual,
    SdkworkMiniProgramPanel: ({ capabilities, controller }: {
      capabilities: MiniProgramCapabilities
      controller: MiniProgramController
    }) => {
      const state = controller.getState()
      return (
        <div data-mode={capabilities.mode} data-testid="panel">
          {state.items.map(item => item.displayName).join(',')}
        </div>
      )
    },
  }
})

afterEach(cleanup)

function account(overrides: Partial<MiniProgramAccount> = {}): MiniProgramAccount {
  return {
    miniProgramId: 'iamora-1',
    tenantId: 't1',
    organizationId: '0',
    appId: 'wx1234567890abcdef',
    displayName: 'My mini program',
    accessMode: 'operator_authorized_account',
    ownerScope: 'tenant',
    integrationId: 'iamoi-1',
    hasAppSecret: true,
    enabled: true,
    status: 'active',
    loginCheckStatus: 'unknown',
    providerConfig: {},
    ...overrides,
  }
}

function controller(overrides: Partial<MiniProgramTransport> = {}) {
  const transport: MiniProgramTransport = {
    list: vi.fn(async () => ({ items: [account()], totalItems: 1, page: 1, pageSize: 20 })),
    create: vi.fn(async () => account()),
    update: vi.fn(async () => account()),
    delete: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    runLoginCheck: vi.fn(async () => ({ accountId: 'iamora-1', status: 'passed' as const })),
    ...overrides,
  }
  return createMiniProgramController(transport, DEFAULT_OPERATOR_CAPABILITIES)
}

describe('MiniProgramsWorkspace', () => {
  it('maps the harness locale onto the panel catalog tag', () => {
    expect(toMiniProgramLocale('zh')).toBe('zh-CN')
    expect(toMiniProgramLocale('en')).toBe('en-US')
    expect(toMiniProgramLocale('ja')).toBe('en-US')
  })

  it('mounts the shared panel with the controller, operator capabilities, and the harness theme', async () => {
    const shared = controller()
    await shared.load()
    render(<MiniProgramsWorkspace colorScheme="dark" controller={shared} language="zh" />)
    expect(screen.getByTestId('panel').getAttribute('data-mode')).toBe('operator')
    expect(screen.getByTestId('panel').textContent).toBe('My mini program')
    expect(screen.getByTestId('theme').getAttribute('data-selection')).toBe('dark')
    expect(screen.getByTestId('i18n').getAttribute('data-locale')).toBe('zh-CN')
  })

  it('passes the English catalog tag when the harness locale is English', async () => {
    const shared = controller()
    await shared.load()
    render(<MiniProgramsWorkspace colorScheme="light" controller={shared} language="en" />)
    expect(screen.getByTestId('i18n').getAttribute('data-locale')).toBe('en-US')
    expect(screen.getByTestId('theme').getAttribute('data-selection')).toBe('light')
  })
})
