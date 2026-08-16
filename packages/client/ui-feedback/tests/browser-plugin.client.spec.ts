/** Registrations, the feedback service, the seam binding, and teardown. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-feedback/client'
import { FeedbackDialog } from '../src/client/FeedbackDialog.tsx'

usePinnedBrowserLanguages('zh-CN')

/** The seats this plugin fills (slot name → expected component). */
const SEATS = [
  ['shell.overlay', FeedbackDialog],
] as const

/** Minimal feedback-seam fake: the plugin only calls setSource on it. */
function feedbackFake() {
  const setSource = vi.fn()
  return {
    getSnapshot: () => ({ available: false }),
    setSource,
    open: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
}

/**
 * Declare the declaration chain the way ui-layout does: the root entry
 * declares the overlay seat; the feedback dialog comes from this plugin's
 * own register.
 */
function declare(slots: SlotRegistry): () => void {
  const rootDispose = slots.register(
    {
      name: 'root',
      children: {
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return () => { rootDispose() }
}

async function bench(envProfile: Partial<{ apiBaseUrl: string; appKey: string; accessToken: string }> = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  let envProfileValue = { apiBaseUrl: 'https://api.sdkwork.com', appKey: 'sdkwork-birdcoder', accessToken: '', ...envProfile }
  const envListeners = new Set<() => void>()
  const setEnvProfile = (next: Partial<{ apiBaseUrl: string; appKey: string; accessToken: string }>): void => {
    envProfileValue = { ...envProfileValue, ...next }
    for (const listener of envListeners) listener()
  }
  ctx.provide('env', {
    isConfigured: () => envProfileValue.apiBaseUrl.trim() !== '',
    apiBaseUrl: () => envProfileValue.apiBaseUrl,
    appId: () => 'sdkwork-birdcoder',
    appKey: () => envProfileValue.appKey,
    accessToken: () => envProfileValue.accessToken,
    subscribe: (listener: () => void) => { envListeners.add(listener); return () => { envListeners.delete(listener) } },
  } as never)
  const feedback = feedbackFake()
  ctx.provide('feedback', feedback as never)
  declare(ctx.get('slots') as SlotRegistry)
  const fiber = ctx.plugin({ apply, inject } as never)
  await fiber.await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, feedback, setEnvProfile, fiber }
}

describe('ui-feedback client plugin', () => {
  it('registers the feedback dialog host with its shared store', async () => {
    const { slots } = await bench()
    for (const [name, component] of SEATS) {
      const entries = slots.entries(name)
      expect(entries.length).toBeGreaterThan(0)
      expect(entries[0].component).toBe(component)
    }
    const overlay = slots.entries('shell.overlay').find(e => e.options.id === 'feedback')
    expect(overlay).not.toBeUndefined()
  })

  it('provides the feedback service and binds the settings-menu seam to a live source', async () => {
    const { ctx, feedback } = await bench()
    expect(ctx.get('feedback')).toBeDefined()
    expect(feedback.setSource).toHaveBeenCalledTimes(1)
    const source = feedback.setSource.mock.calls[0][0] as { getSnapshot(): unknown }
    // The shared environment defaults to the api.sdkwork.com base URL, so the
    // row is available; clearing the base URL hides it.
    expect(source.getSnapshot()).toEqual({ available: true })
    const { feedback: feedbackBlank, setEnvProfile } = await bench({ apiBaseUrl: '' })
    const sourceBlank = feedbackBlank.setSource.mock.calls[0][0] as { getSnapshot(): unknown }
    expect(sourceBlank.getSnapshot()).toEqual({ available: false })
    // An environment move re-renders the seam: the row reappears.
    setEnvProfile({ apiBaseUrl: 'https://api.sdkwork.com' })
    expect(sourceBlank.getSnapshot()).toEqual({ available: true })
  })

  it('keeps the service inert while the IAM plugin is unmounted', async () => {
    const { ctx } = await bench()
    expect(ctx.get('iam')).toBeUndefined()
  })
})
