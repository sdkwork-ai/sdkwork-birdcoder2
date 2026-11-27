// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSkillsToastSource, SkillsToast, type SkillsToastProps } from '../src/client/SkillsToast.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function mount(source: ReturnType<typeof createSkillsToastSource>, dictionary: typeof en | typeof zh = en) {
  const props = {
    useToast: bindSnapshotSelector(source.hooks.toast),
    dismiss: source.dismiss,
    t: makeTranslate(dictionary),
  } as SkillsToastProps
  return render(<SkillsToast {...props} />)
}

describe('SkillsToast', () => {
  it('sequences repeated outcomes and clears the shared notification', () => {
    const source = createSkillsToastSource()
    const listener = vi.fn()
    const stop = source.hooks.toast.subscribe(listener)
    expect(source.hooks.toast.getSnapshot()).toBeNull()

    source.report({ kind: 'added', name: 'Alpha' })
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'added', name: 'Alpha', seq: 1 })
    source.report({ kind: 'added', name: 'Alpha' })
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'added', name: 'Alpha', seq: 2 })
    source.report({ kind: 'failed' })
    expect(source.hooks.toast.getSnapshot()).toEqual({ kind: 'failed', seq: 3 })
    source.dismiss()
    expect(source.hooks.toast.getSnapshot()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(4)

    stop()
    source.report({ kind: 'failed' })
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('renders add success outside the catalog in the active locale', () => {
    const source = createSkillsToastSource()
    mount(source, zh)
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => { source.report({ kind: 'added', name: 'Alpha' }) })
    expect(screen.getByRole('alert').textContent).toBe('已将 Alpha 添加到云端技能库')
  })

  it('renders add failure and dismisses it after the Toast lifetime', () => {
    vi.useFakeTimers()
    const source = createSkillsToastSource()
    mount(source, en)
    act(() => { source.report({ kind: 'failed' }) })
    expect(screen.getByRole('alert').textContent).toBe('Could not add the skill. Try again.')

    act(() => { vi.runAllTimers() })
    expect(source.hooks.toast.getSnapshot()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
