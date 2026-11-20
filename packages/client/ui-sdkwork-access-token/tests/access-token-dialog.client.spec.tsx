// @vitest-environment jsdom
/**
 * Dialog behavior: project discovery on open, the tenant/organization scope
 * choice, the per-root application-type selects, the profile matrix, the
 * claims preview, and the per-file result of an initialization.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AccessTokenDialog, type AccessTokenDialogProps } from '../src/client/AccessTokenDialog.tsx'
import type { AccessTokenFileSystem } from '../src/client/project.ts'
import type { SignedAccessFeatures } from '../src/client/SignedTokenPanel.tsx'
import type { AccessTokenCredentialsFace } from '../src/client/credentials-contract.ts'
import { createAccessTokenDialogStore } from '../src/client/store.ts'
import { decodePublicApplicationAccessToken } from '../src/client/accessToken.ts'
import { MemoryFs } from './memory-fs.client.ts'
import { zh as copy } from '../src/client/locales.ts'

afterEach(cleanup)

/** The translate seat over the plugin's own dictionary. */
const t = makeTranslate(copy)

/** Read the token out of one profile JSON document. */
function jsonToken(text: string): string {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('profile file is not a JSON object')
  const token = (parsed as Record<string, unknown>).SDKWORK_ACCESS_TOKEN
  if (typeof token !== 'string') throw new Error('profile file carries no SDKWORK_ACCESS_TOKEN string')
  return token
}

/** A v3 manifest the initializer can read. */
function manifest(appId: string, displayName: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 3,
    kind: 'agent.app',
    app: { key: appId, displayName, appType: 'APP_REACT' },
    backend: { appId, tenantId: '100001', organizationId: '0' },
    runtime: { framework: 'react-tauri', family: 'web' },
    ...extra,
  })
}

/** One project with two application roots under apps/. */
function projectFs(): MemoryFs {
  return new MemoryFs(
    [
      '/repo', '/repo/apps',
      '/repo/apps/sdkwork-im-pc', '/repo/apps/sdkwork-im-flutter',
    ],
    {
      '/repo/apps/sdkwork-im-pc/agent.app.config.json': manifest('sdkwork-im-pc', 'IM PC'),
      '/repo/apps/sdkwork-im-flutter/agent.app.config.json': manifest(
        'sdkwork-im-flutter-mobile', 'IM Flutter', {
          app: { key: 'sdkwork-im-flutter-mobile', displayName: 'IM Flutter', appType: 'APP_FLUTTER' },
          runtime: { framework: 'flutter', family: 'mobile' },
        },
      ),
    },
  )
}

/** Unused-by-the-public-mode signed face the dialog requires. */
function fakeSigned(overrides: Partial<SignedAccessFeatures> = {}): SignedAccessFeatures {
  return {
    gateway: () => ({ baseUrl: 'https://api.test', bootstrapAccessToken: 'bootstrap-token' }),
    currentSession: async () => undefined,
    login: async () => { throw new Error('the signed flow is not exercised in this spec') },
    listApplications: async () => [],
    exchange: async () => { throw new Error('the signed flow is not exercised in this spec') },
    ...overrides,
  }
}

/** Render the dialog open for one project. */
function renderDialog(
  fs: AccessTokenFileSystem | undefined,
  directory = '/repo',
  displayTitle = 'sdkwork-im',
  signed: SignedAccessFeatures = fakeSigned(),
  credentials: AccessTokenCredentialsFace = {
    read: () => undefined,
    save: async () => { throw new Error('the credentials face is not exercised in this spec') },
    path: () => '/home/.dsh/sdkwork/access-token.config.json',
  },
) {
  const store = createAccessTokenDialogStore()
  const instance = store.create()
  instance.actions.openDialog({ directory, displayTitle })
  const onClose = vi.fn()
  const props = {
    useStore: (selector: (state: ReturnType<typeof instance.getSnapshot>) => unknown) =>
      selector(instance.getSnapshot()),
    fileSystem: () => fs,
    onClose,
    signed,
    credentials,
    t,
  } as unknown as AccessTokenDialogProps
  return { ...render(<AccessTokenDialog {...props} />), instance, onClose }
}

describe('AccessTokenDialog', () => {
  it('lists the discovered roots with their application type and the profile matrix', async () => {
    renderDialog(projectFs())
    expect(await screen.findByText('IM PC')).toBeTruthy()
    expect(screen.getByText('IM Flutter')).toBeTruthy()
    // One type + one runtime select per root.
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
    expect(screen.getByText('standalone.development')).toBeTruthy()
    expect(screen.getByText('cloud.production')).toBeTruthy()
    expect(screen.getByText(/2 个应用根 × 10 个环境 = 20 个文件/)).toBeTruthy()
    // The preview defaults to the first root and first environment.
    expect(screen.getByText('browser')).toBeTruthy()
  })

  it('initializes organization-level tokens across the selected roots and profiles', async () => {
    const fs = projectFs()
    renderDialog(fs)
    await screen.findByText('IM PC')

    fireEvent.click(screen.getByText('组织级'))
    const organizationId = screen.getByPlaceholderText('非 0 的 IAM 组织 ID')
    fireEvent.change(organizationId, { target: { value: '42' } })

    // Narrow the matrix to one environment so the result is easy to assert.
    fireEvent.click(screen.getByRole('button', { name: '全不选' }))
    fireEvent.click(screen.getByText('standalone.development'))
    expect(screen.getByText(/2 个应用根 × 1 个环境 = 2 个文件/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '初始化' }))
    expect(await screen.findByText(/已写入 2 个文件/)).toBeTruthy()

    const pcToken = /SDKWORK_ACCESS_TOKEN=(.+)/u
      .exec(fs.files.get('/repo/apps/sdkwork-im-pc/.env.standalone.development')!)![1]
    expect(decodePublicApplicationAccessToken(pcToken).payload).toMatchObject({
      app_id: 'sdkwork-im-pc',
      tenant_id: '100001',
      organization_id: '42',
      login_scope: 'ORGANIZATION',
      ownership_scope: 'ORGANIZATION',
      runtime_target: 'browser',
    })
    const flutterToken = jsonToken(
      fs.files.get('/repo/apps/sdkwork-im-flutter/env/sdkwork.standalone.development.json')!,
    )
    expect(decodePublicApplicationAccessToken(flutterToken).payload).toMatchObject({
      app_id: 'sdkwork-im-flutter-mobile',
      organization_id: '42',
      runtime_target: 'flutter-android',
    })
    // The result list names every written profile file.
    expect(screen.getByText('/repo/apps/sdkwork-im-pc/.env.standalone.development')).toBeTruthy()
  })

  it('writes tenant-level tokens by default and reports an unchanged repeat', async () => {
    const fs = projectFs()
    const first = renderDialog(fs)
    await screen.findByText('IM PC')
    fireEvent.click(screen.getByRole('button', { name: '全不选' }))
    fireEvent.click(screen.getByText('cloud.production'))
    fireEvent.click(screen.getByRole('button', { name: '初始化' }))
    expect(await screen.findByText(/已写入 2 个文件/)).toBeTruthy()
    const token = /SDKWORK_ACCESS_TOKEN=(.+)/u
      .exec(fs.files.get('/repo/apps/sdkwork-im-pc/.env.cloud.production')!)![1]
    expect(decodePublicApplicationAccessToken(token).payload).toMatchObject({
      organization_id: '0',
      login_scope: 'TENANT',
      ownership_scope: 'TENANT',
      environment: 'production',
    })
    first.unmount()

    renderDialog(fs)
    await screen.findByText('IM PC')
    fireEvent.click(screen.getByRole('button', { name: '全不选' }))
    fireEvent.click(screen.getByText('cloud.production'))
    fireEvent.click(screen.getByRole('button', { name: '初始化' }))
    expect(await screen.findByText(/0 个文件已写入|已写入 0 个文件/)).toBeTruthy()
    expect(screen.getByText(/2 个文件已是相同令牌/)).toBeTruthy()
  })

  it('refuses an organization-level run without an organization id', async () => {
    const fs = projectFs()
    renderDialog(fs)
    await screen.findByText('IM PC')
    fireEvent.click(screen.getByText('组织级'))
    fireEvent.click(screen.getByRole('button', { name: '初始化' }))
    expect(await screen.findByText('组织级令牌需要非 0 的组织 ID')).toBeTruthy()
    expect(fs.writes).toEqual([])
  })

  it('persists an admin login through the DSH-home settings face', async () => {
    const fs = projectFs()
    const signed = fakeSigned({
      login: async () => ({
        baseUrl: 'https://api.test',
        accessToken: 'session-access',
        authToken: 'session-auth',
        userId: '42',
        username: 'admin',
        tenantId: '100001',
        source: 'password',
      }),
      listApplications: async () => [],
    })
    const save = vi.fn(async () => ({
      path: '/home/.dsh/sdkwork/access-token.config.json',
      status: 'written' as const,
    }))
    const credentials: AccessTokenCredentialsFace = {
      read: () => undefined,
      save,
      path: () => '/home/.dsh/sdkwork/access-token.config.json',
    }
    renderDialog(fs, '/repo', 'sdkwork-im', signed, credentials)
    await screen.findByText('IM PC')
    fireEvent.click(screen.getByRole('radio', { name: /签名 Access Token/ }))
    fireEvent.change(await screen.findByLabelText('账号（用户名或邮箱）'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并读取我的应用' }))

    expect(await screen.findByText(/已将 admin\/operator 登录配置保存到/)).toBeTruthy()
    expect(save).toHaveBeenCalledWith('/repo', {
      username: 'admin',
      password: 'pw',
      baseUrl: 'https://api.test',
      bootstrapAccessToken: 'bootstrap-token',
      environment: 'development',
    })
  })

  it('reports a missing directory bridge instead of rendering the form', async () => {
    renderDialog(undefined)
    expect(await screen.findByText(/没有可用的目录读写桥/)).toBeTruthy()
    const initialize = screen.getByRole('button', { name: '初始化' }) as HTMLButtonElement
    expect(initialize.disabled).toBe(true)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('explains a project without any manifest-bearing application root', async () => {
    renderDialog(new MemoryFs(['/repo', '/repo/apps', '/repo/apps/plain']))
    expect(await screen.findByText(/未找到包含 agent.app.config.json 的应用根/)).toBeTruthy()
  })
})
