/** Demand → project bootstrap: directory naming, the session brief, the prompt
 * rejection projection, and the workspace/session flow the demand detail's
 * start-project action drives. Host services are tiny stand-ins; the flow's
 * contract is what this spec pins. */
import { describe, expect, it, vi } from 'vitest'
import {
  DemandProjectError,
  createDemandProjectLauncher,
  createDemandProjectPort,
  demandProjectDirectoryName,
  demandPromptFailure,
  renderDemandBrief,
  resolveAppFormSpec,
  type DemandProjectInput,
  type DemandProjectServices,
  type HostSessionId,
  type HostWorkspaceId,
} from '../src/client/demandProject.ts'

type PromptFn = NonNullable<
  ReturnType<DemandProjectServices['sessions']['binding']>
>['session']['prompt']

const translate = (key: string, params?: Record<string, string>): string =>
  params === undefined ? key : `${key}(${Object.values(params).join('|')})`

const demand: DemandProjectInput = {
  id: 'company-demand-demo-admin',
  title: 'Admin approval platform',
  description: 'Approval flows with reports.',
  category: '管理与业务系统',
  appForm: 'pc',
  budget: '¥80,000',
  bidDeadline: '2026-11-22T00:00:00Z',
}

function bench(overrides: {
  pickDirectory?: () => Promise<string | null>
  createDirectory?: (path: string, name: string) => Promise<string>
  create?: DemandProjectServices['workspaces']['create']
  connectWorkspace?: DemandProjectServices['workspaces']['connectWorkspace']
  prompt?: PromptFn
} = {}) {
  const prompts: string[] = []
  const prompt: PromptFn = overrides.prompt ?? (async (content) => {
    const part = content[0]
    prompts.push(part !== undefined && part.type === 'text' ? part.text : '')
    return { ok: true as const, value: { accepted: true as const } }
  })
  const workspaces = {
    pickDirectory: vi.fn(overrides.pickDirectory ?? (async () => '/home/u/projects')),
    createDirectory: vi.fn(
      overrides.createDirectory ?? (async (parent: string, name: string) => `${parent}/${name}`),
    ),
    create: vi.fn(overrides.create ?? (async ({ path }: { path: string }) => ({
      workspaceId: `ws:${path}` as HostWorkspaceId,
    }))),
    connectWorkspace: vi.fn(
      overrides.connectWorkspace ?? (async () => 'session-1' as HostSessionId),
    ),
    rename: vi.fn(async () => undefined),
  }
  const open = vi.fn()
  const binding = vi.fn<DemandProjectServices['sessions']['binding']>(() => ({ session: { prompt } }))
  return {
    workspaces: workspaces satisfies DemandProjectServices['workspaces'],
    sessions: { open, binding } satisfies DemandProjectServices['sessions'],
    mocks: { ...workspaces, open, binding },
    prompts,
  }
}

describe('demandProjectDirectoryName', () => {
  it('keeps ASCII slug content and collapses the rest', () => {
    expect(demandProjectDirectoryName('Admin Panel v2!!', 'd1')).toBe('admin-panel-v2')
    expect(demandProjectDirectoryName('  spaced__name  ', 'd1')).toBe('spaced__name')
  })

  it('derives a unique fallback from the demand id when the title has no ASCII content', () => {
    expect(demandProjectDirectoryName('企业内部审批与报表平台', 'company-demand-demo-admin'))
      .toBe('demand-company-demand-demo-admin')
    expect(demandProjectDirectoryName('', '')).toBe('demand-project')
  })

  it('bounds the name length', () => {
    expect(demandProjectDirectoryName('a'.repeat(120), 'd1').length).toBe(48)
  })
})

describe('resolveAppFormSpec', () => {
  it('maps every shipped application form to its SDKWork specification', () => {
    expect(resolveAppFormSpec('pc')).toBe('APP_PC_ARCHITECTURE_SPEC.md')
    expect(resolveAppFormSpec('miniprogram')).toBe('MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md')
    expect(resolveAppFormSpec('harmony-native')).toBe('HARMONY_APP_MOBILE_ARCHITECTURE_SPEC.md')
  })

  it('returns undefined for an absent or unknown form', () => {
    expect(resolveAppFormSpec(undefined)).toBeUndefined()
    expect(resolveAppFormSpec('windows-forms')).toBeUndefined()
  })
})

describe('renderDemandBrief', () => {
  it('carries the demand facts, the application form, and its specification', () => {
    const brief = renderDemandBrief(demand, translate)
    expect(brief).toContain('project.brief.heading(Admin approval platform)')
    expect(brief).toContain('project.brief.demandId(company-demand-demo-admin)')
    expect(brief).toContain('project.brief.category(管理与业务系统)')
    expect(brief).toContain('project.brief.appForm(pc)')
    expect(brief).toContain('project.brief.spec(APP_PC_ARCHITECTURE_SPEC.md)')
    expect(brief).toContain('project.brief.budget(¥80,000)')
    expect(brief).toContain('project.brief.deadline(2026-11-22)')
    expect(brief).toContain('project.brief.detail(Approval flows with reports.)')
    expect(brief).toContain('project.brief.instruction')
  })

  it('keeps an app form whose specification is not mapped without a spec line', () => {
    const brief = renderDemandBrief({ id: 'd1', title: 'Demo', appForm: 'windows-forms' }, translate)
    expect(brief).toContain('project.brief.appForm(windows-forms)')
    expect(brief).not.toContain('project.brief.spec')
  })

  it('omits every absent optional fact', () => {
    const brief = renderDemandBrief({ id: 'd1', title: 'Demo' }, translate)
    expect(brief).toContain('project.brief.heading(Demo)')
    expect(brief).not.toContain('project.brief.category')
    expect(brief).not.toContain('project.brief.appForm')
    expect(brief).not.toContain('project.brief.spec')
    expect(brief).not.toContain('project.brief.budget')
    expect(brief).not.toContain('project.brief.deadline')
    expect(brief).not.toContain('project.brief.detail')
  })
})

describe('demandPromptFailure', () => {
  it('is undefined for an accepted prompt', () => {
    expect(demandPromptFailure({ ok: true })).toBeUndefined()
  })

  it('tags a rejected prompt with the prompt phase and the remote message', () => {
    const failure = demandPromptFailure({ ok: false, error: { message: 'model unavailable' } })
    expect(failure).toBeInstanceOf(DemandProjectError)
    expect(failure?.phase).toBe('prompt')
    expect(failure?.message).toContain('model unavailable')
  })
})

describe('createDemandProjectPort', () => {
  it('returns cancellation without touching the workspace when the picker is dismissed', async () => {
    const b = bench({ pickDirectory: async () => null })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).resolves.toEqual({ kind: 'cancelled' })
    expect(b.mocks.createDirectory).not.toHaveBeenCalled()
    expect(b.mocks.create).not.toHaveBeenCalled()
  })

  it('treats an empty picked path as cancellation', async () => {
    const b = bench({ pickDirectory: async () => '   ' })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).resolves.toEqual({ kind: 'cancelled' })
    expect(b.mocks.createDirectory).not.toHaveBeenCalled()
  })

  it('tags a missing directory-picker capability with the directory phase', async () => {
    const b = bench({ pickDirectory: async () => { throw new Error('no picker capability') } })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({ phase: 'directory' })
  })

  it('creates the directory, workspace, and session, then sends the brief', async () => {
    const b = bench()
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).resolves.toEqual({
      kind: 'started',
      workspacePath: '/home/u/projects/admin-approval-platform',
      sessionTitle: 'Admin approval platform',
    })
    expect(b.mocks.createDirectory).toHaveBeenCalledWith('/home/u/projects', 'admin-approval-platform')
    expect(b.mocks.create).toHaveBeenCalledWith({ path: '/home/u/projects/admin-approval-platform' })
    expect(b.mocks.rename).toHaveBeenCalledWith(
      'ws:/home/u/projects/admin-approval-platform',
      'Admin approval platform',
    )
    expect(b.mocks.connectWorkspace).toHaveBeenCalledWith('ws:/home/u/projects/admin-approval-platform')
    expect(b.mocks.open).toHaveBeenCalledWith('session-1')
    expect(b.prompts).toHaveLength(1)
    expect(b.prompts[0]).toContain('project.brief.heading(Admin approval platform)')
    expect(b.prompts[0]).toContain('APP_PC_ARCHITECTURE_SPEC.md')
  })

  it('keeps the project usable when the workspace rename fails', async () => {
    const b = bench()
    vi.mocked(b.mocks.rename).mockRejectedValueOnce(new Error('rename refused'))
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).resolves.toMatchObject({ kind: 'started' })
  })

  it('retries with a numeric suffix when the directory name is taken', async () => {
    let attempts = 0
    const b = bench({
      createDirectory: async (parent, name) => {
        attempts += 1
        if (attempts === 1) throw new Error('directory-exists')
        return `${parent}/${name}`
      },
    })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).resolves.toMatchObject({
      workspacePath: '/home/u/projects/admin-approval-platform-2',
    })
  })

  it('fails with the directory phase when every attempt collides', async () => {
    const b = bench({ createDirectory: async () => { throw new Error('directory-exists') } })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({
      name: 'DemandProjectError',
      phase: 'directory',
    })
    expect(b.mocks.open).not.toHaveBeenCalled()
  })

  it('tags a workspace registration failure with its phase', async () => {
    const b = bench({ create: async () => { throw new Error('workspace refused') } })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({ phase: 'workspace' })
    expect(b.mocks.open).not.toHaveBeenCalled()
  })

  it('tags a session connection failure with its phase', async () => {
    const b = bench({ connectWorkspace: async () => { throw new Error('session refused') } })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({ phase: 'session' })
    expect(b.mocks.open).not.toHaveBeenCalled()
  })

  it('fails when the new session exposes no binding', async () => {
    const b = bench()
    vi.mocked(b.mocks.binding).mockReturnValueOnce(undefined)
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({ phase: 'session' })
  })

  it('tags a rejected prompt with the prompt phase', async () => {
    const b = bench({
      prompt: async () => {
        throw new Error('model unavailable')
      },
    })
    const port = createDemandProjectPort({ workspaces: b.workspaces, sessions: b.sessions }, translate)
    await expect(port.start(demand)).rejects.toMatchObject({ phase: 'prompt' })
  })
})

describe('createDemandProjectLauncher', () => {
  it('dismisses the hosting overlay once the project starts', async () => {
    const closeOverlay = vi.fn()
    const launched = createDemandProjectLauncher({
      start: async () => ({ kind: 'started', workspacePath: '/p', sessionTitle: 'Demo' }),
    }, closeOverlay)
    await expect(launched.start(demand)).resolves.toMatchObject({ kind: 'started' })
    expect(closeOverlay).toHaveBeenCalledTimes(1)
  })

  it('keeps the overlay open when the picker is dismissed', async () => {
    const closeOverlay = vi.fn()
    const launched = createDemandProjectLauncher({
      start: async () => ({ kind: 'cancelled' }),
    }, closeOverlay)
    await expect(launched.start(demand)).resolves.toEqual({ kind: 'cancelled' })
    expect(closeOverlay).not.toHaveBeenCalled()
  })

  it('keeps the overlay open when the bootstrap fails', async () => {
    const closeOverlay = vi.fn()
    const launched = createDemandProjectLauncher({
      start: async () => { throw new DemandProjectError('directory', 'no picker') },
    }, closeOverlay)
    await expect(launched.start(demand)).rejects.toBeInstanceOf(DemandProjectError)
    expect(closeOverlay).not.toHaveBeenCalled()
  })
})
