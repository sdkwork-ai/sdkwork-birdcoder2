// @vitest-environment jsdom
/**
 * ui-sdkwork-git plugin halves and the branch pill: the browser entry's
 * dictionary and header-actions registration against the real SlotRegistry
 * (with fiber teardown proving removal — HMR safety), the inert node entry,
 * the pill's render behavior over a fake git port (hidden without a project
 * directory or on git failure, branch label, popover branches with the
 * dirty-count line, search, checkout), and the two product dialogs: the
 * centered create-and-checkout modal and the near-fullscreen git graph modal
 * (header columns, lane rows, ref badges, refresh).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { GitBranchPill } from '../src/client/GitBranchPill.tsx'
import type { SdkworkGitPort } from '../src/client/gitPort.ts'
import type { GitBranchPillProps } from '../src/client/GitBranchPill.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

const SESSION = 'git-session' as never as string
const REPO = 'E:/workspace/bird'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Fake git port with canned responses and call recorders. */
function fakeGit(options: {
  branches?: string[]
  current?: string
  dirtyCount?: number
  additions?: number
  deletions?: number
  failStatus?: boolean
  commits?: number
} = {}): SdkworkGitPort {
  const total = options.commits ?? 2
  return {
    status: vi.fn(async () => {
      if (options.failStatus === true) throw new Error('not a repository')
      return {
        branch: options.current ?? 'main',
        commit: 'a'.repeat(40),
        dirtyCount: options.dirtyCount ?? 0,
        ahead: 0,
        behind: 0,
        additions: options.additions ?? 0,
        deletions: options.deletions ?? 0,
      }
    }),
    branches: vi.fn(async () => ({
      current: options.current ?? 'main',
      branches: (options.branches ?? ['main', 'feature/alpha']).map(name => ({
        name, current: name === (options.current ?? 'main'), commit: 'b'.repeat(40),
      })),
    })),
    checkout: vi.fn(async (_cwd: string, branch: string) => branch),
    createAndCheckout: vi.fn(async (_cwd: string, name: string) => name),
    commit: vi.fn(async (_cwd: string, message: string) => ({
      commit: 'd'.repeat(40),
      branch: message === '' ? null : 'main',
    })),
    push: vi.fn(async () => ({ branch: 'main', upstream: 'origin/main' })),
    log: vi.fn(async () => Array.from({ length: total }, (_, index) => ({
      hash: `c${index}`.padEnd(40, '0'),
      parents: index + 1 < total ? [`c${index + 1}`.padEnd(40, '0')] : [],
      refs: {
        head: index === 0 ? 'main' : null,
        branches: index === 0 ? ['feature/alpha'] : [],
        remotes: index === 0 ? ['origin/main'] : [],
        tags: index === 0 ? ['birdcoder-v0.1.3'] : [],
      },
      author: 'sdkwork-ai',
      time: Date.UTC(2026, 8, 5, 11, 12),
      subject: index === 0 ? 'chore: sync repo state' : `commit ${index}`,
    }))),
  }
}

/** Props with a stubbed session list carrying one project directory. */
function props(git: SdkworkGitPort, options: { cwd?: string | undefined } = {}): GitBranchPillProps {
  const cwd = options.cwd
  const useSessions = <T,>(select: (value: { byId: Record<string, { cwd?: string } | undefined> }) => T): T =>
    select({ byId: { [SESSION]: cwd === undefined ? undefined : { cwd } } })
  return {
    sessionId: SESSION,
    useSessions,
    git,
    t: makeTranslate(en),
  } as never as GitBranchPillProps
}

/** Slot ledger reader: whether the header utilities seat has a live registration. */
function actionsOccupied(ctx: Context): boolean {
  return ctx.slots.entries('conversation.session.header.utilities').length > 0
}

/** Boot the browser half over a real slot tree that declares the utilities seat. */
async function bench(gitPort: SdkworkGitPort | undefined): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  // Cordis resolves inject names VERBATIM: the dotted `remote.sdkworkGit` key
  // is provided as a literal service (the remotes assembly does this in
  // production), and the nested `remote` stub only serves `ctx.remote` reads.
  const stubNamespace = {}
  ctx.provide('remote', { $on: () => () => {}, sdkworkGit: gitPort === undefined ? undefined : stubNamespace } as never)
  ctx.provide('remote.sdkworkGit', stubNamespace as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-git browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.sdkworkGit'])
  })

  it('registers the header actions entry, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench(fakeGit())
    expect(actionsOccupied(ctx)).toBe(true)
    await fiber.dispose()
    expect(actionsOccupied(ctx)).toBe(false)
  })

  it('registers its dictionary under its own namespace and keeps en key-identical', async () => {
    const { ctx } = await bench(fakeGit())
    const translate = ctx.locale.bind(NS)
    expect(translate('popover.branchesSection')).toBe(zh['popover.branchesSection'])
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-sdkwork-git node half', () => {
  it('applies as an inert host plugin', () => {
    expect(() => applyNode()).not.toThrow()
  })
})

describe('GitBranchPill trigger', () => {
  it('renders nothing while the session has no project directory', async () => {
    const view = render(<GitBranchPill {...props(fakeGit(), { cwd: undefined })} />)
    expect(view.container.innerHTML).toBe('')
    await act(async () => {})
    expect(view.container.innerHTML).toBe('')
  })

  it('renders nothing when the git status read fails (no repository)', async () => {
    const view = render(<GitBranchPill {...props(fakeGit({ failStatus: true }), { cwd: REPO })} />)
    await waitFor(() => expect(view.container.innerHTML).toBe(''))
  })

  it('shows the checked-out branch once the status read settles', async () => {
    render(<GitBranchPill {...props(fakeGit({ current: 'main' }), { cwd: REPO })} />)
    await waitFor(() => expect(screen.getByRole('button', { name: en['pill.openAria'] })).toBeDefined())
    expect(screen.getByText('main')).toBeDefined()
  })

  it('renders the skeleton pill immediately while the first status read is in flight', async () => {
    let resolveStatus: ((value: Awaited<ReturnType<SdkworkGitPort['status']>>) => void) | undefined
    const git = fakeGit()
    git.status = vi.fn(() => new Promise<Awaited<ReturnType<SdkworkGitPort['status']>>>((resolve) => { resolveStatus = resolve }))
    const view = render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    // Before the promise settles, the pill is mounted as a disabled skeleton
    // with the loading label (async-load design: never a blank header).
    const skeleton = view.container.querySelector('button[disabled][aria-busy="true"]')
    expect(skeleton).not.toBeNull()
    expect(skeleton!.textContent).toContain(en['pill.loading'])
    expect(git.status).toHaveBeenCalledWith(REPO)
    // Settling swaps the skeleton for the real branch label.
    await act(async () => { resolveStatus!({
      branch: 'main',
      commit: 'a'.repeat(40),
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      additions: 0,
      deletions: 0,
    }) })
    await waitFor(() => expect(screen.getByText('main')).toBeDefined())
    expect(view.container.querySelector('button[disabled]')).toBeNull()
  })

  it('does not drop back to the skeleton while a refresh is in flight after a status is held', async () => {
    const git = fakeGit({ current: 'main' })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    await screen.findByText('main')
    // A later refresh keeps the held branch label visible (no flicker).
    await act(async () => { git.status(REPO) })
    expect(screen.getByText('main')).toBeDefined()
  })
})

describe('GitBranchPill panel', () => {

  it('opens the branch list, marks the current branch, and shows the dirty-count line', async () => {
    const git = fakeGit({ branches: ['main', 'feature/alpha', 'wip/beta'], current: 'main', dirtyCount: 73 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    // The tools panel (图1) renders the changes row with the diff totals and
    // the commit-or-push row before the picker opens.
    expect(await screen.findByText(en['panel.changes'])).toBeDefined()
    expect(screen.getByText(en['panel.commitOrPush'])).toBeDefined()
    // Expand the inline branch picker under the branch row.
    fireEvent.click(screen.getByRole('button', { name: /main/ }))
    expect(await screen.findByText(en['popover.branchesSection'])).toBeDefined()
    await waitFor(() => expect(screen.getByText('wip/beta')).toBeDefined())
    // The panel is portaled to document.body, outside the component container.
    expect(document.body.textContent).toContain(en['popover.dirty'].replace('{count}', '73'))
    // Checkout rows exist only for the non-current branches.
    expect(screen.getByRole('button', { name: new RegExp('feature/alpha') })).toBeDefined()
  })

  it('reuses the cached branch listing on a picker re-open until a status refresh', async () => {
    const git = fakeGit({ branches: ['main', 'feature/alpha'], current: 'main' })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    await screen.findByText('feature/alpha')
    expect(git.branches).toHaveBeenCalledTimes(1)
    // Collapse and re-expand the picker: the cache serves the listing with no
    // second git read.
    fireEvent.click(screen.getByRole('button', { name: /main/ }))
    fireEvent.click(screen.getByRole('button', { name: /main/ }))
    await screen.findByText('feature/alpha')
    expect(git.branches).toHaveBeenCalledTimes(1)
    // Checking out a branch runs a status refresh, which invalidates the
    // cache: the next picker open re-reads the repository.
    fireEvent.click(screen.getByRole('button', { name: new RegExp('feature/alpha') }))
    await waitFor(() => expect(git.checkout).toHaveBeenCalledWith(REPO, 'feature/alpha'))
    await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    await screen.findByText('feature/alpha')
    expect(git.branches).toHaveBeenCalledTimes(2)
  })

  it('shows the diff totals on the changes row', async () => {
    const git = fakeGit({ additions: 10016, deletions: 346 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    expect(await screen.findByText('+10016')).toBeDefined()
    expect(screen.getByText('-346')).toBeDefined()
  })

  it('filters branches through the search field', async () => {
    const git = fakeGit({ branches: ['main', 'feature/alpha', 'wip/beta'] })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    await screen.findByText(en['popover.branchesSection'])
    await waitFor(() => expect(screen.getByText('wip/beta')).toBeDefined())
    fireEvent.change(screen.getByPlaceholderText(en['popover.searchPlaceholder']), { target: { value: 'wip' } })
    expect(screen.queryByText('feature/alpha')).toBeNull()
    expect(screen.getByText('wip/beta')).toBeDefined()
  })

  it('checks out a branch through the row and refreshes the pill', async () => {
    const git = fakeGit({ branches: ['main', 'feature/alpha'] })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('feature/alpha') }))
    await waitFor(() => expect(git.checkout).toHaveBeenCalledWith(REPO, 'feature/alpha'))
    await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2))
  })

  it('lists the recent-commit history rows in the panel', async () => {
    const git = fakeGit({ commits: 2 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    expect(await screen.findByText(en['panel.historySection'])).toBeDefined()
    await waitFor(() => expect(screen.getByText('chore: sync repo state')).toBeDefined())
    expect(screen.getByText('commit 1')).toBeDefined()
  })

  it('surfaces the availability message when the branch list fails', async () => {
    const git = fakeGit({ branches: ['main'] })
    git.branches = vi.fn(async () => {
      throw new Error('git command failed')
    })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    await screen.findByText(en['popover.error'])
  })
})

describe('GitCreateBranchModal', () => {
  it('opens from the branch picker footer as a centered dialog and creates on confirm', async () => {
    const git = fakeGit({ branches: ['main'] })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.createBranch'] }))
    const dialog = await screen.findByRole('dialog', { name: en['create.title'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The product copy (图1) renders in the dialog.
    expect(document.body.textContent).toContain(en['create.description'])
    expect(document.body.textContent).toContain(en['create.headHint'])
    const field = screen.getByPlaceholderText(en['create.namePlaceholder'])
    fireEvent.change(field, { target: { value: 'wip/new-work' } })
    fireEvent.click(screen.getByRole('button', { name: en['create.confirm'] }))
    await waitFor(() => expect(git.createAndCheckout).toHaveBeenCalledWith(REPO, 'wip/new-work'))
    // Success closes the dialog and refreshes the pill status.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en['create.title'] })).toBeNull())
    await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2))
  })

  it('keeps the confirm button disabled while the name is blank', async () => {
    const git = fakeGit({ branches: ['main'] })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.createBranch'] }))
    await screen.findByPlaceholderText(en['create.namePlaceholder'])
    expect(screen.getByRole('button', { name: en['create.confirm'] }).hasAttribute('disabled')).toBe(true)
  })

  it('surfaces a host rejection inside the dialog instead of closing it', async () => {
    const git = fakeGit({ branches: ['main'] })
    git.createAndCheckout = vi.fn(async () => {
      throw new Error('branch-name-invalid: "bad name.." is not a valid branch name')
    })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: /main/ }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.createBranch'] }))
    fireEvent.change(await screen.findByPlaceholderText(en['create.namePlaceholder']), { target: { value: 'bad name..' } })
    fireEvent.click(screen.getByRole('button', { name: en['create.confirm'] }))
    await screen.findByText(/branch-name-invalid/)
    // The dialog stays mounted so the user can correct the name.
    expect(screen.getByRole('dialog', { name: en['create.title'] })).not.toBeNull()
  })
})

describe('GitGraphModal', () => {
  it('opens as a near-fullscreen dialog with the product column strip and rows', async () => {
    const git = fakeGit({ commits: 3 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    // The graph entry is the panel's persistent bottom strip — reachable
    // without expanding the branch picker.
    fireEvent.click(await screen.findByRole('button', { name: en['popover.gitGraph'] }))
    const dialog = await screen.findByRole('dialog', { name: en['graph.title'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('[data-git-graph]')).not.toBeNull()
    // Column strip (图2) and the row facts.
    expect(document.body.textContent).toContain(en['graph.col.graph'])
    expect(document.body.textContent).toContain(en['graph.col.description'])
    expect(document.body.textContent).toContain(en['graph.col.date'])
    expect(document.body.textContent).toContain(en['graph.col.author'])
    expect(document.body.textContent).toContain(en['graph.col.commit'])
    expect(document.body.textContent).toContain('chore: sync repo state')
    expect(document.body.textContent).toContain('sdkwork-ai')
    // Ref badges: HEAD, the head branch, the remote, the tag.
    expect(document.body.textContent).toContain('HEAD')
    expect(document.body.textContent).toContain('origin/main')
    expect(document.body.textContent).toContain('birdcoder-v0.1.3')
    // The lane graph renders one node per row (badge glyphs carry circles too,
    // so the node count scopes to the lane SVGs).
    expect(document.querySelectorAll('[data-git-graph] [data-lane-svg]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-git-graph] [data-lane-svg] circle')).toHaveLength(3)
  })

  it('closes the panel when the graph dialog opens', async () => {
    const git = fakeGit()
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.gitGraph'] }))
    await screen.findByRole('dialog', { name: en['graph.title'] })
    expect(screen.queryByText(en['panel.title'])).toBeNull()
  })

  it('re-reads the log through the refresh button', async () => {
    const git = fakeGit()
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.gitGraph'] }))
    await screen.findByRole('dialog', { name: en['graph.title'] })
    // One log read for the panel history, one for the graph dialog.
    await waitFor(() => expect(git.log).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: en['graph.refresh'] }))
    await waitFor(() => expect(git.log).toHaveBeenCalledTimes(3))
  })

  it('shows the availability message when the log read fails', async () => {
    const git = fakeGit()
    git.log = vi.fn(async () => {
      throw new Error('git command failed')
    })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['popover.gitGraph'] }))
    await screen.findByText(en['popover.error'])
  })
})

describe('GitCommitModal', () => {
  it('opens from the panel as a centered dialog with the branch/diff header', async () => {
    const git = fakeGit({ current: 'main', dirtyCount: 279, additions: 13186, deletions: 347 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['panel.changes'] }))
    const dialog = await screen.findByRole('dialog', { name: en['commit.title'] })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.body.textContent).toContain('+13186')
    expect(document.body.textContent).toContain('-347')
    expect(document.body.textContent).toContain('279')
  })

  it('commits with the message and the include-unstaged scope', async () => {
    const git = fakeGit({ dirtyCount: 3 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['panel.changes'] }))
    fireEvent.change(await screen.findByPlaceholderText(en['commit.messagePlaceholder']), {
      target: { value: 'fix: the thing' },
    })
    // The plain-commit row is the one carrying the Ctrl+Enter hint.
    const commitRow = screen.getAllByRole('button', { name: new RegExp(en['commit.actionCommit']) })
      .find(button => button.textContent?.includes('Ctrl'))
    fireEvent.click(commitRow!)
    await waitFor(() => expect(git.commit).toHaveBeenCalledWith(REPO, 'fix: the thing', true))
    // Success closes the dialog and refreshes the pill status.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en['commit.title'] })).toBeNull())
    await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2))
  })

  it('commits and pushes through the stacked action row', async () => {
    const git = fakeGit({ dirtyCount: 3 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['panel.changes'] }))
    fireEvent.change(await screen.findByPlaceholderText(en['commit.messagePlaceholder']), {
      target: { value: 'feat: ship it' },
    })
    fireEvent.click(screen.getByRole('button', { name: en['commit.actionCommitPush'] }))
    await waitFor(() => expect(git.commit).toHaveBeenCalledWith(REPO, 'feat: ship it', true))
    await waitFor(() => expect(git.push).toHaveBeenCalledWith(REPO))
  })

  it('keeps the plain commit disabled while the message is blank', async () => {
    const git = fakeGit({ dirtyCount: 3 })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['panel.changes'] }))
    await screen.findByPlaceholderText(en['commit.messagePlaceholder'])
    const commitButton = screen.getAllByRole('button', { name: new RegExp(en['commit.actionCommit']) })
      .find(button => button.textContent?.includes('Ctrl'))
    expect(commitButton?.hasAttribute('disabled')).toBe(true)
  })

  it('surfaces a host rejection inside the dialog instead of closing it', async () => {
    const git = fakeGit({ dirtyCount: 3 })
    git.commit = vi.fn(async () => {
      throw new Error('commit-failed: nothing staged')
    })
    render(<GitBranchPill {...props(git, { cwd: REPO })} />)
    fireEvent.click(await screen.findByRole('button', { name: en['pill.openAria'] }))
    fireEvent.click(await screen.findByRole('button', { name: en['panel.changes'] }))
    fireEvent.change(await screen.findByPlaceholderText(en['commit.messagePlaceholder']), {
      target: { value: 'bad commit' },
    })
    const commitRow = screen.getAllByRole('button', { name: new RegExp(en['commit.actionCommit']) })
      .find(button => button.textContent?.includes('Ctrl'))
    fireEvent.click(commitRow!)
    await screen.findByText(/commit-failed/)
    expect(screen.getByRole('dialog', { name: en['commit.title'] })).not.toBeNull()
  })
})
