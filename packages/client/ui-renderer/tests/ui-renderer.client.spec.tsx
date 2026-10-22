// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '../src/client/registry.ts'
import type { SlotScopeAdapter, StandardSourceBinding } from '../src/client/index.ts'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-renderer'
import * as UiRenderer from '../src/client/index.ts'

const mounted: (() => void)[] = []

afterEach(() => {
  act(() => { for (const unmount of mounted.splice(0)) unmount() })
  vi.restoreAllMocks()
  cleanup()
  document.body.innerHTML = ''
})

const stabilize = async (fn: () => void | Promise<void>): Promise<void> => {
  await act(async () => { await fn() })
}

async function bench() {
  const ctx = new Context()
  const fiber = ctx.plugin({ inject: [...UiRenderer.inject], apply: UiRenderer.apply })
  await fiber.await()
  const slots = ctx.get('slots') as SlotRegistry
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }
  const current = {
    getSnapshot: () => absentBinding,
    subscribe: () => () => {},
  }
  const adapter: SlotScopeAdapter = {
    current,
    bindingSource: () => current,
  }
  slots.installScope('session', adapter)
  return { ctx, slots, fiber }
}

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('UI renderer plugin', () => {
  it('provides no host-side behavior', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('installs the renderer and mounts the assembled application', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const renderer = ctx.get('uiRenderer')
    expect(renderer).toBeDefined()
    const el = container()
    act(() => { mounted.push(renderer!.mount(el)) })
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy()
  })

  it('hydrates the boot page before switching to the assembled application', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const el = container()
    el.innerHTML = '<div class="boot" data-dsh-boot=""><div><div class="spinner" data-dsh-boot-spinner="" style="--dsh-boot-arc: 180deg"></div><div>Loading plugins…</div></div></div>'
    const boot = el.firstElementChild
    const observer = new MutationObserver(() => {})
    observer.observe(el, { childList: true, subtree: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => { mounted.push(ctx.get('uiRenderer')!.mount(el)) })

    const records = observer.takeRecords()
    observer.disconnect()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy()
    expect(records.some(record => record.target === boot)).toBe(false)
  })

  it('mounts an entry whose inject hook source is missing instead of crashing the slot', async () => {
    const { ctx, slots } = await bench()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Root = (props: { renderSlot: (key: 'probe.slot') => ReactNode }): ReactNode => (
      <>{props.renderSlot('probe.slot')}</>
    )
    const Probe = (props: { useBroken?: (selector: (snapshot: Record<string, unknown>) => unknown) => unknown }): ReactNode => (
      <div data-testid="probe">{String(props.useBroken?.(snapshot => snapshot.missing))}</div>
    )
    slots.register(
      { name: 'root', children: { 'probe.slot': { kind: 'single', scope: 'root' } } } as never,
      Root as never,
    )
    slots.register({ name: 'probe.slot', inject: () => ({ hooks: { broken: undefined } }) } as never, Probe as never)

    const el = container()
    act(() => { mounted.push(ctx.get('uiRenderer')!.mount(el)) })

    // The entry still renders; its hook reads the empty snapshot the renderer
    // bound in place of the missing observable source.
    expect(el.querySelector('[data-testid="probe"]')?.textContent).toBe('undefined')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('not an observable'), undefined)
  })

  it('mounts an entry whose inject face throws instead of blanking the slot', async () => {
    const { ctx, slots } = await bench()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Root = (props: { renderSlot: (key: 'probe.slot') => ReactNode }): ReactNode => (
      <>{props.renderSlot('probe.slot')}</>
    )
    slots.register(
      { name: 'root', children: { 'probe.slot': { kind: 'single', scope: 'root' } } } as never,
      Root as never,
    )
    slots.register({ name: 'probe.slot', inject: () => { throw new Error('boom') } } as never, (() => <div data-testid="probe" />) as never)

    const el = container()
    act(() => { mounted.push(ctx.get('uiRenderer')!.mount(el)) })

    expect(el.querySelector('[data-testid="probe"]')).toBeTruthy()
    expect(el.querySelector('[data-slot-error]')).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('inject failed'), expect.any(Error))
  })

  it('returns an unmount disposer', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const el = container()
    let unmount: () => void = () => {}
    act(() => { unmount = ctx.get('uiRenderer')!.mount(el) })
    act(() => { unmount() })
    expect(el.querySelector('[data-testid="root-probe"]')).toBeNull()
  })

  it('retracts the service and renderer with its fiber', async () => {
    const { ctx, slots, fiber } = await bench()
    await stabilize(() => fiber.dispose())
    expect(ctx.get('uiRenderer')).toBeUndefined()
    expect(() => slots.renderSlot('root', {})).toThrow('not installed')
  })
})
