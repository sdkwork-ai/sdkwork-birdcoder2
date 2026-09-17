// @vitest-environment jsdom
/**
 * The conversation-header build indicator and the host state behind it.
 *
 * Two layers are covered separately on purpose. The component specs hand it a
 * hand-built snapshot, so the row layout, the bar's determinate/indeterminate
 * split and the detail callback are asserted without a process in the loop. The
 * host specs drive a scripted Remote, so the snapshot the component actually
 * receives — progress folding, minimise/restore, the exit transition — is
 * asserted against the real publisher.
 */
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { BuildIndicator } from '../src/client/appBuild/BuildIndicator.tsx'
import { createAppBuildPanelHost, type AppBuildIndicatorSnapshot, type AppBuildTrack } from '../src/client/appBuild/panelHost.ts'
import { percentFromLine, percentOfLines } from '../src/client/appBuild/progress.ts'
import type {
  AppBuildFrame, AppBuildRemoteNamespace, AppBuildRemoteResult,
} from '../src/client/appBuild/contract.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)
const ROOT = '/w/alpha/apps/alpha-h5'
const TASK = 'app-build-1'

describe('percentFromLine', () => {
  it('reads a figure the tool printed as its line\'s trailing token', () => {
    expect(percentFromLine('Packaging   45%')).toBe(45)
    expect(percentFromLine('rendering chunks 100%')).toBe(100)
    expect(percentFromLine('  7%  ')).toBe(7)
  })

  it('ignores a figure that only appears inside the prose', () => {
    // The anchor is what keeps a log line *mentioning* a percentage from
    // driving the bar: only a trailing token is a progress report.
    expect(percentFromLine('about 50% of users see the cached page')).toBeNull()
    expect(percentFromLine('45% (done)')).toBeNull()
    expect(percentFromLine('no figure here')).toBeNull()
  })

  it('settles on the trailing figure when a line carries several', () => {
    expect(percentFromLine('phase 1 at 30% — phase 2 at 80%')).toBe(80)
  })

  it('reads a [done/total] step counter', () => {
    expect(percentFromLine('[3/10] Bundling entry points')).toBe(30)
    expect(percentFromLine('chunks [1/3]')).toBe(33)
  })

  it('rejects figures that cannot be progress', () => {
    expect(percentFromLine('download 120%')).toBeNull()
    expect(percentFromLine('[5/0] nope')).toBeNull()
    expect(percentFromLine('[9/4] out of step')).toBeNull()
  })

  it('folds a batch to its last signal and keeps the previous one otherwise', () => {
    // A new phase printing its own figure resets the bar rather than leaving
    // the finished phase's 100% stuck on screen.
    expect(percentOfLines(['10%', 'noise', '0%'], 100)).toBe(0)
    expect(percentOfLines(['still no figure'], 42)).toBe(42)
  })
})

/** One tracked build with the defaults every fixture shares. */
function track(extra: Partial<AppBuildTrack> = {}): AppBuildTrack {
  return {
    id: TASK,
    label: 'H5 · prod',
    status: 'running',
    percent: null,
    startedAt: 1_000,
    durationMs: null,
    minimized: false,
    ...extra,
  }
}

/** A fixed observable over one snapshot, standing in for the host's store. */
function snapshotOf(tasks: readonly AppBuildTrack[], now = 13_000): {
  getSnapshot: () => AppBuildIndicatorSnapshot
  subscribe: () => () => void
} {
  const value: AppBuildIndicatorSnapshot = { tasks, now }
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

/** The one row a single-task fixture renders. */
function onlyRow(): HTMLElement {
  const rows = screen.getAllByRole('menuitem')
  expect(rows).toHaveLength(1)
  return rows[0] as HTMLElement
}

describe('BuildIndicator', () => {
  it('renders nothing while no build is tracked', () => {
    const empty = render(<BuildIndicator t={t} indicator={snapshotOf([])} />)
    expect(empty.container.firstChild).toBeNull()
  })

  it('renders nothing without the host observable', () => {
    const bare = render(<BuildIndicator t={t} />)
    expect(bare.container.firstChild).toBeNull()
  })

  it('turns while a build runs and reports how many are live', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track()])} />)
    const trigger = screen.getByRole('button', { name: '构建任务：1 个构建进行中' })
    expect(trigger.dataset.active).toBe('true')
    // The spinning glyph is what a collapsed build shows instead of a panel;
    // its class comes from the CSS module, so match the local name.
    expect(trigger.querySelector('svg')?.getAttribute('class')).toMatch(/spin/)
    expect(trigger.textContent).toBe('1')
  })

  it('stays still when nothing is building', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'succeeded', percent: 100, durationMs: 12_300,
    })])} />)
    const trigger = screen.getByRole('button', { name: '构建任务' })
    expect(trigger.dataset.active).toBe('false')
    expect(trigger.querySelector('svg')?.getAttribute('class')).not.toMatch(/spin/)
  })

  it('lists every tracked build with a status and a determinate bar', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({ percent: 45 })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务：1 个构建进行中' }))

    const row = onlyRow()
    expect(row.textContent).toContain('H5 · prod')
    expect(row.textContent).toContain('构建中')
    expect(row.textContent).toContain('45%')
    // Elapsed comes off the snapshot clock, not a wall clock in the component.
    expect(row.textContent).toContain('12s')
    const bar = row.querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.indeterminate).toBe('false')
    expect(bar.dataset.tone).toBe('active')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('45%')
  })

  it('sweeps instead of inventing a figure the tool never printed', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({ percent: null })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务：1 个构建进行中' }))

    const bar = onlyRow().querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.indeterminate).toBe('true')
    // No inline width: the sweep animation owns the fill's geometry.
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('')
  })

  it('fills and tones a finished run rather than leaving it mid-sweep', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'succeeded', percent: null, durationMs: 8_100,
    })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务' }))

    const row = onlyRow()
    const bar = row.querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.indeterminate).toBe('false')
    expect(bar.dataset.tone).toBe('success')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
    expect(row.textContent).toContain('构建成功')
    expect(row.textContent).toContain('8s')
  })

  it('fills a successful run even when its last printed figure was partial', () => {
    // The ordinary shape: a bundler reports "42%" and then stops reporting
    // before it stops running, so the success frame arrives with 42% as the
    // last figure. Leaving the bar at 42% makes a finished build read as
    // unfinished, which is why success always means full.
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'succeeded', percent: 42, durationMs: 5_000,
    })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务' }))

    const bar = onlyRow().querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.tone).toBe('success')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('leaves an empty track when a run stopped with no figure at all', () => {
    // A start that never spawned built nothing, so a full bar would claim the
    // opposite of what happened — the status copy already carries the "why".
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'rejected', percent: null,
    })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务' }))

    const bar = onlyRow().querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.tone).toBe('error')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('0%')
  })

  it('keeps an unknown distance empty for a run that died early too', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'failed', percent: null, durationMs: 2_000,
    })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务' }))

    const bar = onlyRow().querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.tone).toBe('error')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('0%')
  })

  it('tones a failure as an error and keeps how far it got', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([track({
      status: 'failed', percent: 30, durationMs: 4_000,
    })])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务' }))

    const bar = onlyRow().querySelector('[data-indeterminate]') as HTMLElement
    expect(bar.dataset.tone).toBe('error')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('30%')
  })

  it('marks a collapsed task and orders live builds above finished ones', () => {
    render(<BuildIndicator t={t} indicator={snapshotOf([
      track({ id: 'done', label: 'PC · prod', status: 'succeeded', durationMs: 1_000 }),
      track({ id: 'live', label: 'H5 · prod', minimized: true }),
    ])} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务：1 个构建进行中' }))

    const labels = screen.getAllByRole('menuitem').map(row => row.textContent)
    expect(labels[0]).toContain('H5 · prod')
    expect(labels[0]).toContain('已最小化')
    expect(labels[1]).toContain('PC · prod')
  })

  it('opens the detail of the clicked row and closes the list', () => {
    const onOpenDetail = vi.fn()
    render(<BuildIndicator t={t} indicator={snapshotOf([track({ minimized: true })])} onOpenDetail={onOpenDetail} />)
    fireEvent.click(screen.getByRole('button', { name: '构建任务：1 个构建进行中' }))

    fireEvent.click(onlyRow())
    expect(onOpenDetail).toHaveBeenCalledWith(TASK)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('re-reads the host snapshot when the store publishes', () => {
    // The component subscribes rather than snapshotting once: this is what
    // makes the icon start turning the moment a build begins. The fixture
    // caches its value like the real store — a `getSnapshot` that builds a
    // fresh object every call makes React re-render forever.
    let value: AppBuildIndicatorSnapshot = { tasks: [], now: 13_000 }
    const listeners = new Set<() => void>()
    const observable = {
      getSnapshot: (): AppBuildIndicatorSnapshot => value,
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    render(<BuildIndicator t={t} indicator={observable} />)
    expect(screen.queryByRole('button', { name: '构建任务' })).toBeNull()

    value = { tasks: [track()], now: 13_000 }
    act(() => { for (const listener of [...listeners]) listener() })
    expect(screen.getByRole('button', { name: '构建任务：1 个构建进行中' })).toBeTruthy()
  })
})

/**
 * A scripted Remote: frames are pushed by the test, so "still running" is a
 * stable state to assert instead of a race against a generator that would
 * otherwise emit its exit frame before the first assertion ran.
 */
function scriptedRemote(): {
  namespace: AppBuildRemoteNamespace
  push(frame: AppBuildFrame): void
} {
  const frames: AppBuildFrame[] = []
  let wake: (() => void) | undefined
  const started: AppBuildRemoteResult<{ buildId: string; command: string; cwd: string }> = {
    ok: true, value: { buildId: 'b1', command: 'pnpm run build:prod', cwd: ROOT },
  }
  return {
    namespace: {
      describe: async () => ({ ok: true as const, value: { cwd: '/w/alpha', families: [], missing: [] } }),
      start: async () => started,
      cancel: async () => ({ ok: true as const, value: { cancelled: true } }),
      follow: async function* (): AsyncGenerator<AppBuildFrame> {
        let index = 0
        // The pump never ends on its own; teardown is `dispose`'s job, exactly
        // as with a real stream that the abort signal cuts.
        for (;;) {
          const frame = frames[index]
          if (frame !== undefined) {
            index += 1
            yield frame
            continue
          }
          await new Promise<void>((resolve) => { wake = resolve })
        }
      },
    },
    push: (frame) => {
      frames.push(frame)
      const pending = wake
      wake = undefined
      pending?.()
    },
  }
}

/** A host over the scripted Remote, plus its teardown for the test body. */
function hostOver(remote: { namespace: AppBuildRemoteNamespace }): ReturnType<typeof createAppBuildPanelHost> {
  return createAppBuildPanelHost({
    remote: () => remote.namespace,
    locale: { translate: () => t, subscribe: () => () => {} },
  })
}

describe('build panel host indicator state', () => {
  it('publishes a live task, folds its progress, and fills on exit', async () => {
    const remote = scriptedRemote()
    const host = hostOver(remote)
    host.run({ cwd: ROOT, script: 'build:prod', label: 'H5 · prod' })

    await vi.waitFor(() => {
      const [task] = host.indicator.getSnapshot().tasks
      expect(task?.status).toBe('running')
    })
    const [running] = host.indicator.getSnapshot().tasks
    expect(running?.label).toBe('H5 · prod')
    expect(running?.percent).toBeNull()
    expect(running?.minimized).toBe(false)

    remote.push({ type: 'output', buildId: 'b1', stream: 'stdout', text: 'rendering chunks 42%' })
    await vi.waitFor(() => {
      expect(host.indicator.getSnapshot().tasks[0]?.percent).toBe(42)
    })

    remote.push({
      type: 'exit', buildId: 'b1', outcome: 'succeeded', exitCode: 0, signal: null, durationMs: 5_000,
    })
    await vi.waitFor(() => {
      const [task] = host.indicator.getSnapshot().tasks
      expect(task?.status).toBe('succeeded')
    })
    expect(host.indicator.getSnapshot().tasks[0]?.durationMs).toBe(5_000)
    host.dispose()
  })

  it('collapses the card into the header and restores it on open-detail', async () => {
    const remote = scriptedRemote()
    const host = hostOver(remote)
    host.run({ cwd: ROOT, script: 'build:prod', label: 'H5 · prod' })
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('pnpm run build:prod')
    })

    // The card's own minimise control is the operator gesture; the host is the
    // one that removes the panel, so both halves are asserted.
    fireEvent.click(screen.getByRole('button', { name: '最小化到标题栏' }))
    await vi.waitFor(() => {
      expect(host.indicator.getSnapshot().tasks[0]?.minimized).toBe(true)
    })
    await act(async () => {})
    expect(document.body.textContent).not.toContain('pnpm run build:prod')

    host.expand(TASK)
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('pnpm run build:prod')
    })
    expect(host.indicator.getSnapshot().tasks[0]?.minimized).toBe(false)
    host.dispose()
  })

  it('drops every task and the panel on teardown', async () => {
    const remote = scriptedRemote()
    const host = hostOver(remote)
    host.run({ cwd: ROOT, script: 'build:prod', label: 'H5 · prod' })
    await vi.waitFor(() => {
      expect(host.indicator.getSnapshot().tasks).toHaveLength(1)
    })

    host.dispose()
    await act(async () => {})
    expect(host.indicator.getSnapshot().tasks).toHaveLength(0)
    expect(document.body.textContent).not.toContain('pnpm run build:prod')
  })

  it('stays a no-op when no build Remote is mounted', () => {
    const host = createAppBuildPanelHost({
      remote: () => undefined,
      locale: { translate: () => t, subscribe: () => () => {} },
    })
    host.run({ cwd: ROOT, script: 'build:prod', label: 'H5 · prod' })
    expect(host.indicator.getSnapshot().tasks).toHaveLength(0)
    host.dispose()
  })
})
