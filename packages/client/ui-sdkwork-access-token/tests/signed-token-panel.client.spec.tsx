// @vitest-environment jsdom
/**
 * Signed-token panel behavior: configured credentials log in automatically,
 * the mounted IAM session is reused, only the signed-in user's applications
 * are offered, and the issued credential is validated before it is shown.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  MyApplication, SdkworkSession, SignedAccessCredential,
} from '../src/client/signedToken.ts'
import type { SignedAccessFeatures } from '../src/client/SignedTokenPanel.tsx'
import { SignedTokenPanel } from '../src/client/SignedTokenPanel.tsx'
import { zh as copy } from '../src/client/locales.ts'

afterEach(cleanup)

/** The translate seat over the plugin's own dictionary. */
const t = makeTranslate(copy)

/** Encode one UTF-8 JSON value as an unpadded base64url segment. */
function encodeSegment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** Build one signed credential for the fixture session. */
function signedCredential(app: MyApplication, current: SdkworkSession): SignedAccessCredential {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    app_id: app.anchor,
    aud: app.anchor,
    tenant_id: current.tenantId,
    organization_id: app.organizationId,
    ownership_scope: app.ownershipScope,
    user_id: current.userId,
    token_class: 'access',
    exp: now + 3600,
    iat: now,
  }
  return {
    accessToken: `${encodeSegment({ alg: 'RS256' })}.${encodeSegment(claims)}.c2lnbmF0dXJl`,
    authToken: 'signed-auth-token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    appId: app.anchor,
    tenantApplicationId: 'tapp_1',
    organizationId: '0',
    ownershipScope: 'USER',
    environment: 'development',
    claims,
  }
}

/** One session fixture. */
function session(): SdkworkSession {
  return {
    baseUrl: 'https://api.test',
    accessToken: 'session-access',
    authToken: 'session-auth',
    userId: '42',
    username: 'alice',
    tenantId: '100001',
    source: 'password',
  }
}

/** One own application. */
function ownApp(): MyApplication {
  return {
    anchor: '381157858269466624',
    id: 'app-uuid',
    name: 'Alice App',
    slug: 'alice-app',
    ownershipScope: 'USER',
    ownerUserId: '42',
    organizationId: '0',
    createdBy: '42',
    status: 'ACTIVE',
  }
}

/** One foreign application. */
function foreignApp(): MyApplication {
  return {
    ...ownApp(),
    anchor: '999',
    name: 'Foreign App',
    ownerUserId: '7',
    createdBy: '7',
  }
}

/** Buildable fake transport with per-case overrides. */
function fakeSigned(overrides: Partial<SignedAccessFeatures> = {}): SignedAccessFeatures & {
  login: ReturnType<typeof vi.fn>
  listApplications: ReturnType<typeof vi.fn>
  exchange: ReturnType<typeof vi.fn>
} {
  const current = session()
  return {
    gateway: () => ({ baseUrl: 'https://api.test', bootstrapAccessToken: 'bootstrap-token' }),
    currentSession: async () => undefined,
    login: vi.fn(async () => current),
    listApplications: vi.fn(async () => [ownApp(), foreignApp()]),
    exchange: vi.fn(async (_session: SdkworkSession, request: { appId: string }) => {
      const app = request.appId === foreignApp().anchor ? foreignApp() : ownApp()
      return signedCredential(app, current)
    }),
    ...overrides,
  } as SignedAccessFeatures & {
    login: ReturnType<typeof vi.fn>
    listApplications: ReturnType<typeof vi.fn>
    exchange: ReturnType<typeof vi.fn>
  }
}

describe('SignedTokenPanel', () => {
  it('auto-logs in with the remembered login and offers only the user’s applications', async () => {
    const signed = fakeSigned()
    render(
      <SignedTokenPanel
        signed={signed}
        savedCredentials={{ username: 'alice', password: 'secret', baseUrl: '', bootstrapAccessToken: '', environment: '' }}
        t={t}
      />,
    )

    expect(await screen.findByText(/当前用户：alice/)).toBeTruthy()
    expect(signed.login).toHaveBeenCalledWith({
      baseUrl: 'https://api.test',
      bootstrapAccessToken: 'bootstrap-token',
      username: 'alice',
      password: 'secret',
    })
    expect(signed.listApplications).toHaveBeenCalledOnce()
    const select = screen.getByLabelText('我创建的应用') as HTMLSelectElement
    expect(select.options).toHaveLength(1)
    expect(select.options[0]?.textContent).toContain('Alice App')
    // The login form is gone once a session exists, so the password value is
    // unreachable from the DOM.
    expect(screen.queryByLabelText('密码')).toBeNull()
  })

  it('signs in from the form when no session or configured credential exists', async () => {
    const signed = fakeSigned()
    render(<SignedTokenPanel signed={signed} t={t} />)
    expect(await screen.findByText(copy['signed.config.missing'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText('账号（用户名或邮箱）'), { target: { value: 'bob' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并读取我的应用' }))

    expect(await screen.findByText(/当前用户/)).toBeTruthy()
    expect(signed.login).toHaveBeenCalledWith(expect.objectContaining({ username: 'bob', password: 'pw' }))
  })

  it('reuses the mounted session without a login', async () => {
    const signed = fakeSigned({ currentSession: async () => session() })
    const { container } = render(<SignedTokenPanel signed={signed} t={t} />)
    expect(await screen.findByText(/当前用户/)).toBeTruthy()
    expect(signed.login).not.toHaveBeenCalled()
    expect(container.querySelector('input[type="password"]')).toBeNull()
  })

  it('generates and displays a validated signed credential for the selected application', async () => {
    const signed = fakeSigned({ currentSession: async () => session() })
    render(<SignedTokenPanel signed={signed} t={t} />)
    await screen.findByText(/当前用户/)
    fireEvent.click(screen.getByRole('button', { name: '生成签名令牌' }))

    expect(await screen.findByText('签名令牌已生成')).toBeTruthy()
    expect(signed.exchange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '42' }),
      { appId: '381157858269466624', environment: 'development' },
    )
    const tokenBox = screen.getByLabelText('Access-Token') as HTMLTextAreaElement
    expect(tokenBox.value.split('.')).toHaveLength(3)
    expect(screen.getAllByText('USER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('381157858269466624').length).toBeGreaterThan(0)
  })

  it('shows a validation failure instead of an unsafe credential', async () => {
    const invalid: SignedAccessCredential = {
      ...signedCredential(ownApp(), session()),
      accessToken: `${encodeSegment({ alg: 'none' })}.${encodeSegment({ app_id: ownApp().anchor })}.public`,
    }
    const signed = fakeSigned({
      currentSession: async () => session(),
      exchange: vi.fn(async () => invalid),
    })
    render(<SignedTokenPanel signed={signed} t={t} />)
    await screen.findByText(/当前用户/)
    fireEvent.click(screen.getByRole('button', { name: '生成签名令牌' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('签名令牌已生成')).toBeNull()
  })

  it('explains an account that created no applications', async () => {
    const signed = fakeSigned({
      currentSession: async () => session(),
      listApplications: vi.fn(async () => [foreignApp()]),
    })
    render(<SignedTokenPanel signed={signed} t={t} />)
    expect(await screen.findByText(/当前账号没有创建任何应用/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '生成签名令牌' }).hasAttribute('disabled')).toBe(true)
  })

  it('reports a failed login without leaving the form busy', async () => {
    const signed = fakeSigned({
      login: vi.fn(async () => { throw new Error('invalid credentials') }),
    })
    render(<SignedTokenPanel
      signed={signed}
      savedCredentials={{ username: 'alice', password: 'bad', baseUrl: '', bootstrapAccessToken: '', environment: '' }}
      t={t}
    />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('invalid credentials')
    expect(screen.getByRole('button', { name: '登录并读取我的应用' }).hasAttribute('disabled')).toBe(false)
  })

  it('renders the gateway from the resolved configuration', async () => {
    const signed: SignedAccessFeatures = {
      gateway: () => ({ baseUrl: 'https://cfg.test', bootstrapAccessToken: 'cfg-token' }),
      currentSession: async () => session(),
      login: async () => session(),
      listApplications: async () => [ownApp()],
      exchange: async () => signedCredential(ownApp(), session()),
    }
    render(<SignedTokenPanel signed={signed} t={t} />)
    expect(await screen.findByText('网关：https://cfg.test')).toBeTruthy()
  })

  it('remembers an admin login in the DSH-home settings section', async () => {
    const admin = { ...session(), username: 'admin' }
    const signed = fakeSigned({
      login: vi.fn(async () => admin),
      listApplications: vi.fn(async () => [ownApp()]),
    })
    const saveCredentials = vi.fn(async () => ({
      path: '/home/.dsh/sdkwork/access-token.config.json',
      status: 'written' as const,
    }))
    render(
      <SignedTokenPanel
        signed={signed}
        saveCredentials={saveCredentials}
        t={t}
      />,
    )
    expect(await screen.findByText(copy['signed.config.missing'])).toBeTruthy()
    fireEvent.change(screen.getByLabelText('账号（用户名或邮箱）'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并读取我的应用' }))

    expect(await screen.findByText(/已将 admin\/operator 登录配置保存到/)).toBeTruthy()
    expect(saveCredentials).toHaveBeenCalledWith({
      username: 'admin',
      password: 'pw',
      baseUrl: 'https://api.test',
      bootstrapAccessToken: 'bootstrap-token',
      environment: 'development',
    })
  })

  it('remembers a configured operator login during the automatic sign-in', async () => {
    const operator = { ...session(), username: 'operator01' }
    const signed = fakeSigned({
      login: vi.fn(async () => operator),
      listApplications: vi.fn(async () => [ownApp()]),
    })
    const saveCredentials = vi.fn(async () => ({
      path: '/home/.dsh/sdkwork/access-token.config.json',
      status: 'unchanged' as const,
    }))
    render(
      <SignedTokenPanel
        signed={signed}
        savedCredentials={{ username: 'operator01', password: 'pw', baseUrl: '', bootstrapAccessToken: '', environment: '' }}
        saveCredentials={saveCredentials}
        t={t}
      />,
    )
    expect(await screen.findByText(/admin\/operator 登录配置已是最新/)).toBeTruthy()
    expect(saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
      username: 'operator01',
      password: 'pw',
    }))
  })

  it('never remembers an ordinary account and reports a failed save without losing the session', async () => {
    const signed = fakeSigned()
    const saveCredentials = vi.fn(async () => ({
      path: '/home/.dsh/sdkwork/access-token.config.json',
      status: 'written' as const,
    }))
    const { unmount } = render(
      <SignedTokenPanel
        signed={signed}
        savedCredentials={{ username: 'alice', password: 'pw', baseUrl: '', bootstrapAccessToken: '', environment: '' }}
        saveCredentials={saveCredentials}
        t={t}
      />,
    )
    expect(await screen.findByText(/当前用户/)).toBeTruthy()
    expect(saveCredentials).not.toHaveBeenCalled()
    unmount()

    const failing = fakeSigned({
      login: vi.fn(async () => ({ ...session(), username: 'admin' })),
      listApplications: vi.fn(async () => [ownApp()]),
    })
    render(
      <SignedTokenPanel
        signed={failing}
        savedCredentials={{ username: 'admin', password: 'pw', baseUrl: '', bootstrapAccessToken: '', environment: '' }}
        saveCredentials={vi.fn(async () => { throw new Error('disk full') })}
        t={t}
      />,
    )
    expect(await screen.findByText(/登录成功，但登录配置保存失败/)).toBeTruthy()
    expect(screen.getAllByText(/当前用户/).length).toBeGreaterThan(0)
  })
})
