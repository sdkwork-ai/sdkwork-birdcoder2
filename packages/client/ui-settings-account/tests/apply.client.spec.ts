// @vitest-environment jsdom
/** Desktop account operations and ordinary-browser isolation in the shipped client composition. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, vi } from 'vitest'
import { ok } from '@deepseek-ai/dsh-remote-mock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import {
  ClientRoster, createClientTest, type TestClient, webApp,
} from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type { AccountDetails, AccountView, AccountUserId, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from '../src/client/AccountSection.tsx'
import { CONTACT_CONFIG_GLOBAL } from '../src/contact-config.ts'

// FORK DIVERGENCE: the fork's web composition disables ui-settings-general
// (ui-sdkwork-settings-menu re-declares every settings seat) and account
// sections register into its `settings.launcher`. The spec therefore mounts
// the section host on top of the real roster; production follows the fork's
// bundle rows, where the account section lives in the fork's settings menu.
function withSectionHostRemounted(roster: typeof webApp): typeof webApp {
  const manifestPath = resolve(process.cwd(), 'packages/client/ui-settings-general/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string
    dsh?: { client?: { inject?: readonly string[]; immediately?: boolean } }
  }
  const name = manifest.name ?? '@deepseek-ai/dsh-client-ui-settings-general'
  const client = manifest.dsh?.client
  return ClientRoster.of([
    ...roster.rows,
    { name, inject: client?.inject ?? [], immediately: client?.immediately === true },
  ])
}
// FORK DIVERGENCE (settings composition): the fork's bundle replaces the
// upstream settings shell with ui-sdkwork-settings-menu, so these specs --
// which register the account section into the upstream shell's
// `settings.launcher` -- cannot run under the fork composition. Unskip when
// the fork adopts upstream's settings shell; the bundle rows to flip are
// documented in packages/bundle/web-app/cordis.patch.yml.
const clientTest = createClientTest({ roster: withSectionHostRemounted(webApp) })
const it = clientTest.skip
const SELF = '@deepseek-ai/dsh-client-ui-settings-account'
const view: AccountView = { status: 'signed-out', attempt: null, links: { usageUrl: '', topUpUrl: '' } }
const stored: AccountView = { ...view, status: 'credential-stored' }
const profile: AccountDetails['profile'] = { status: 'ready', value: { id: 'account-user' as AccountUserId, name: 'User', contact: null } }
function operations(c: TestClient): AccountSectionInjected {
  const injected: object = c.ctx.slots.entries('settings.launcher')[0]!.inject!()
  return injected as AccountSectionInjected
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps account UI and account RPC inactive in a plain browser, including after reload', async ({ start, mock }) => {
  const c = await start()
  for (const reload of [false, true]) {
    if (reload) await c.reload(SELF)
    await c.flush()
    expect(c.ctx.slots.entries('settings.launcher')).toHaveLength(0)
    expect(c.ctx.slots.entries('settings.models.sign-in')).toHaveLength(0)
    expect(c.ctx.slots.entries('settings.section').some(entry => entry.options.id === 'account')).toBe(false)
    expect(mock.log.calls().filter(call => call.endpoint.startsWith('account/'))).toEqual([])
    expect(mock.log.streams().filter(stream => stream.endpoint.startsWith('account/'))).toEqual([])
  }
}, 60_000)

it('shares account actions across seats, publishes dialog ownership, and opens contextual support', async ({ start }) => {
  vi.stubGlobal(CONTACT_CONFIG_GLOBAL, { contactFormUrl: 'https://example.test/form/', contactSource: 'harness' })
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  const actions = operations(c)
  expect(c.ctx.slots.entries('settings.models.sign-in')[0]!.inject!()).toBe(actions)
  await actions.refresh()
  expect(c.mock.remote.account.getProfile).not.toHaveBeenCalled()
  const listener = vi.fn()
  const off = actions.hooks.account.subscribe(listener)
  actions.showLogin(true)
  actions.setOnboarding(true)
  expect(actions.hooks.account.getSnapshot()).toMatchObject({ loginVisible: true, onboarding: true })
  expect(listener).toHaveBeenCalledTimes(2)
  off()
  actions.showLogin(false)
  expect(listener).toHaveBeenCalledTimes(2)
  actions.contactUs()
  expect(new URL(String(open.mock.calls.at(-1)![0])).searchParams.has('prefill_uid')).toBe(false)
  c.mock.remote.account.getProfile.mockResolvedValue(ok(profile))
  c.mock.streams.push('account/watch', stored)
  await vi.waitFor(() => { expect(actions.hooks.account.getSnapshot().details?.profile).toEqual(profile) })
  const entry = c.ctx.slots.entries('settings.section').find(entry => entry.options.id === 'account')!
  expect(entry.inject!()).toBe(actions)
  expect(resolveSlotLabel(entry.options.label)).toBe('Account')
  vi.spyOn(c.ctx.locale, 'getSnapshot').mockReturnValue({ ...c.ctx.locale.getSnapshot(), active: 'zh' })
  actions.contactUs()
  const support = new URL(String(open.mock.calls.at(-1)![0]))
  expect(support.searchParams.get('prefill_uid')).toBe('account-user')
  expect(support.searchParams.get('prefill_app_locale')).toBe('zh-CN')
  await c.unload(SELF)
  expect(c.ctx.slots.entries('settings.launcher')).toHaveLength(0)
}, 60_000)

it('coalesces refreshes, publishes independent failures, and rejects stale responses after sign-out or unload', async ({ start }) => {
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  const actions = operations(c)
  const pending = Promise.withResolvers<ReturnType<typeof ok<AccountDetails['profile'] | null>>>()
  c.mock.remote.account.getProfile.mockReturnValueOnce(pending.promise)
  c.mock.remote.account.getBalance.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) })
  c.mock.streams.push('account/watch', stored)
  await vi.waitFor(() => { expect(c.mock.remote.account.getProfile).toHaveBeenCalledOnce() })
  const a = actions.refresh()
  expect(actions.refresh()).toBe(a)
  c.mock.streams.push('account/watch', view)
  await vi.waitFor(() => { expect(actions.hooks.account.getSnapshot().view).toEqual(view) })
  pending.resolve(ok(profile))
  await a
  expect(actions.hooks.account.getSnapshot().details).toBeUndefined()
  c.mock.remote.account.getProfile.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) })
  c.mock.remote.account.getBalance.mockRejectedValueOnce(new Error('offline'))
  c.mock.streams.push('account/watch', stored)
  await vi.waitFor(() => { expect(actions.hooks.account.getSnapshot().details).toEqual({ profile: { status: 'failed' }, balance: { status: 'failed' } }) })
  const pendingAgain = Promise.withResolvers<ReturnType<typeof ok<AccountDetails['profile'] | null>>>()
  c.mock.remote.account.getProfile.mockReturnValueOnce(pendingAgain.promise)
  const request = actions.refresh()
  await c.unload(SELF)
  pendingAgain.resolve(ok(profile))
  await request
  expect(actions.hooks.account.getSnapshot().details?.profile).toEqual({ status: 'failed' })
}, 60_000)

it('uses the Desktop login carrier and exposes operation errors', async ({ start, mock }) => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  const actions = operations(c)
  mock.remote.account.startSignIn.mockResolvedValue(ok(view))
  await actions.start()
  expect(mock.remote.account.startSignIn).toHaveBeenCalledWith('en', window.location.origin, 'desktop')
  const failure = { ok: false as const, error: new RemoteError('gateway/internal', 'offline', {}) }
  mock.remote.account.startSignIn.mockResolvedValueOnce(failure)
  await expect(actions.start()).rejects.toThrow('account start failed')
  expect(actions.hooks.account.getSnapshot()).toMatchObject({ loginVisible: true, loginFailed: true })
  const id = 'cancel-me' as SignInAttemptId
  mock.remote.account.cancelSignIn.mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(failure)
  await actions.cancel(id)
  await expect(actions.cancel(id)).rejects.toThrow('account cancel failed')
  mock.remote.account.signOut.mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(failure)
  await actions.signOut()
  await expect(actions.signOut()).rejects.toThrow('account sign-out failed')
}, 60_000)

it('uses the Desktop stream origin and exposes the native platform bridge', async ({ start, mock }) => {
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  vi.stubGlobal('__DSH_TRANSPORT__', { streamBaseUrl: 'http://localhost:9876/stream' })
  const platform = { open: vi.fn(), setBounds: vi.fn(), close: vi.fn() }
  vi.stubGlobal('dshPlatform', platform)
  await c.reload(SELF)
  const actions = operations(c)
  expect(actions.platform).toBe(platform)
  mock.remote.account.startSignIn.mockResolvedValue(ok(view))
  await actions.start()
  expect(mock.remote.account.startSignIn).toHaveBeenCalledWith('en', 'http://localhost:9876', 'desktop')
}, 60_000)


it('publishes a terminal state-stream failure without mistaking it for plugin disposal', async ({ start }) => {
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  const actions = operations(c)
  await c.mock.streams.opened('account/watch', 1)
  c.mock.streams.end('account/watch')
  await vi.waitFor(() => { expect(actions.hooks.account.getSnapshot().failed).toBe(true) })
}, 60_000)

it('ignores a terminal stream error when plugin disposal already owns teardown', async ({ start }) => {
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  let disposal: Promise<void> | undefined
  const original = c.ctx.remote.$stream.bind(c.ctx.remote)
  const spy = vi.spyOn(c.ctx.remote, '$stream').mockImplementation((options) => {
    const stream = original(options)
    stream.signal.addEventListener('abort', () => { disposal = c.unload(SELF) }, { once: true })
    return stream
  })
  await c.reload(SELF)
  spy.mockRestore()
  const actions = operations(c)
  await c.mock.streams.opened('account/watch', 2)
  c.mock.streams.end('account/watch')
  await vi.waitFor(() => { expect(disposal).toBeDefined() })
  await disposal
  expect(actions.hooks.account.getSnapshot().failed).toBe(false)
}, 60_000)
