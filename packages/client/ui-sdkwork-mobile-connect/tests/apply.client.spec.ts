/**
 * ui-sdkwork-mobile-connect apply wiring: the rail shortcut registers against
 * the frame's panel seat above the message center, and its injected face hands
 * the card the live settings section plus one fenced preference write.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-mobile-connect/client'
import { MobileConnectEntry, type MobileConnectEntryInjected } from '../src/client/MobileConnectEntry.tsx'
import { en } from '../src/client/locales.ts'
import { MOBILE_CONNECT_NAMESPACE, REMOTE_ACCESS_FIELD, type MobileConnectSettings } from '../src/settings.ts'

const RAIL_PANEL = 'mode.rail.panel'

/** One accepted settings section. */
const SECTION: ConfigFormSnapshot<MobileConnectSettings> = {
  status: 'ready',
  value: {
    remoteAccessEnabled: true,
    appDownloadUrl: 'https://sdkwork.test/app',
    miniProgramUrl: 'https://sdkwork.test/mp',
  },
  base: undefined,
  user: undefined,
  revision: 3,
  writable: true,
}

/** Boot the client slots, the locale registry, and a recording settings scope. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const stub = stubConfigForm<MobileConnectSettings>()
  stub.publish(SECTION)
  ctx.provide('configForms', { get: () => stub.scope } as never)
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots')
  if (slots === undefined) throw new Error('the bench must provide the slots service')
  slots.register(
    {
      name: 'root',
      children: {
        [RAIL_PANEL]: { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return { ctx, slots, stub }
}

/** Read the shortcut's injected face. */
function injected(face: unknown): MobileConnectEntryInjected {
  return (face as () => MobileConnectEntryInjected)()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ui-sdkwork-mobile-connect apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'configForms'])
  })

  it('registers one shortcut above the message center', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply })
    await fiber.await()

    const [entry] = b.slots.entries(RAIL_PANEL)
    expect(entry?.options.id).toBe('mobile-connect')
    expect(entry?.options.order).toBe(15)
    expect(entry?.component).toBe(MobileConnectEntry)
    expect(entry?.locale).toBe('mobileConnect')

    await fiber.dispose()
    expect(b.slots.entries(RAIL_PANEL)).toEqual([])
  })

  it('reads its own namespace and writes the switch field through the same scope', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply })
    await fiber.await()

    const [entry] = b.slots.entries(RAIL_PANEL)
    const face = injected(entry?.inject)
    expect(face.hooks.config.getSnapshot()).toBe(b.stub.scope.getSnapshot())
    await expect(face.setRemoteAccess(false)).resolves.toBe(true)
    expect(b.stub.set).toHaveBeenCalledExactlyOnceWith(REMOTE_ACCESS_FIELD, false)

    await fiber.dispose()
    expect(MOBILE_CONNECT_NAMESPACE).toBe('ui-sdkwork-mobile-connect')
    expect(en['rail.label']).toBe('Mobile connection')
  })

  it('republishes the section when the Host accepts a write', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply })
    await fiber.await()

    const [entry] = b.slots.entries(RAIL_PANEL)
    const source = injected(entry?.inject).hooks.config
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    b.stub.publish({
      revision: 4,
      value: { remoteAccessEnabled: false, appDownloadUrl: 'https://sdkwork.test/app', miniProgramUrl: 'https://sdkwork.test/mp' },
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(source.getSnapshot().value?.remoteAccessEnabled).toBe(false)
    unsubscribe()

    await fiber.dispose()
  })

  it('reports a refused or failed write as false without throwing', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply })
    await fiber.await()
    const [entry] = b.slots.entries(RAIL_PANEL)
    const face = injected(entry?.inject)

    b.stub.set.mockResolvedValueOnce(false)
    await expect(face.setRemoteAccess(true)).resolves.toBe(false)

    b.stub.set.mockRejectedValueOnce(new Error('transport down'))
    await expect(face.setRemoteAccess(true)).resolves.toBe(false)

    await fiber.dispose()
  })
})
