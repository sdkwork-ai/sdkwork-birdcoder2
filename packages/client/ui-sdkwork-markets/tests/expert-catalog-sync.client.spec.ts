import { describe, expect, it, vi } from 'vitest'
import {
  syncExpertCatalogFromSdkworkAgents,
  type ExpertCatalogPage,
  type ExpertCatalogSdkClient,
  type ExpertCatalogSyncRemote,
} from '../src/client/expertCatalogSync.ts'

function page<T>(items: T[]): ExpertCatalogPage<T> {
  return { items }
}

/** A scripted App SDK client: each list method records its calls and returns its pages. */
function fakeClient(script: {
  divisions: ExpertCatalogPage<{ code: string; name: string; sortOrder: number; expertCount: number }>[]
  experts: ExpertCatalogPage<{
    slug: string
    agentId: string
    name: string
    description: string
    emoji: string
    divisionCode: string
    tags: string[]
  }>[]
  teams: ExpertCatalogPage<{ teamId: string; name: string; description: string; tags: string[]; goal: string; constraints: string; deliveryRequirements: string; examples: string[]; coordinatorMode: 'template'; coordinatorTemplateId: 'product'; coordinatorPrompt: string; locale: 'zh-CN'; members: { expertSlug: string; expertAgentId: string; duty: string; instructions: string }[] }>[]
  personas: Record<'zh-CN' | 'en-US', ExpertCatalogPage<{ expertSlug: string; agentId: string; locale: 'zh-CN' | 'en-US'; persona: string; contentSha256: string }>[]>
}): { client: ExpertCatalogSdkClient; calls: string[] } {
  const calls: string[] = []
  const next = <T>(pages: ExpertCatalogPage<T>[], pageNumber: number): ExpertCatalogPage<T> => {
    calls.push(`${pages === script.divisions ? 'divisions' : pages === script.experts ? 'experts' : 'other'}:${pageNumber}`)
    return pages[pageNumber - 1] ?? page([])
  }
  const client = {
    ai: {
      experts: {
        divisions: { list: async (params?: { page?: number }) => next(script.divisions, params?.page ?? 1) },
        list: async (params?: { page?: number }) => next(script.experts, params?.page ?? 1),
      },
      expertTeams: {
        list: async (params?: { page?: number; locale?: 'zh-CN' | 'en-US' }) => next(script.teams, params?.page ?? 1),
      },
      expertPersonas: {
        list: async (params?: { page?: number; locale?: 'zh-CN' | 'en-US' }) => {
          const locale = params?.locale ?? 'zh-CN'
          calls.push(`personas:${locale}:${params?.page ?? 1}`)
          return script.personas[locale][(params?.page ?? 1) - 1] ?? page([])
        },
      },
    },
  } as unknown as ExpertCatalogSdkClient
  return { client, calls }
}

/** A Remote double that records payloads and can fail one method. */
function fakeRemote(options: { failCatalog?: boolean; failPersonas?: boolean } = {}) {
  const calls: { method: string; payload: unknown }[] = []
  const remote: ExpertCatalogSyncRemote = {
    async syncSdkworkCatalog(payload) {
      calls.push({ method: 'catalog', payload })
      if (options.failCatalog === true) return { ok: false, error: { message: 'catalog rejected' } }
      return { ok: true, value: { experts: payload.experts.length, teams: payload.teams.length } }
    },
    async syncSdkworkPersonas(payload) {
      calls.push({ method: `personas:${payload.locale}`, payload })
      if (options.failPersonas === true) return { ok: false, error: { message: 'personas rejected' } }
      return { ok: true, value: { count: payload.personas.length } }
    },
  }
  return { remote, calls }
}

const division = { code: 'product', name: '产品', sortOrder: 10, expertCount: 2 }
const expertA = { slug: 'product-manager', agentId: 'agent.expert.product-manager', name: '产品经理', description: '负责需求', emoji: '🧩', divisionCode: 'product', tags: ['expert'] }
const expertB = { slug: 'design-ux-researcher', agentId: 'agent.expert.design-ux-researcher', name: '用户研究员', description: '研究用户', emoji: '🔍', divisionCode: 'design', tags: ['expert'] }
const team = {
  teamId: 'team-product',
  name: '产品评审团',
  description: '评审产品',
  tags: ['评审'],
  goal: '评审',
  constraints: '仅评审，不改文件',
  deliveryRequirements: '清单',
  examples: ['评审需求'],
  coordinatorMode: 'template' as const,
  coordinatorTemplateId: 'product' as const,
  coordinatorPrompt: '',
  locale: 'zh-CN' as const,
  members: [
    { expertSlug: 'product-manager', expertAgentId: 'agent.expert.product-manager', duty: '需求', instructions: '检查需求' },
    { expertSlug: 'design-ux-researcher', expertAgentId: 'agent.expert.design-ux-researcher', duty: '体验', instructions: '检查体验' },
  ],
}
const personaZh = { expertSlug: 'product-manager', agentId: 'agent.expert.product-manager', locale: 'zh-CN' as const, persona: '中文人格', contentSha256: 'a'.repeat(64) }
const personaEn = { expertSlug: 'product-manager', agentId: 'agent.expert.product-manager', locale: 'en-US' as const, persona: 'English persona', contentSha256: 'b'.repeat(64) }

describe('syncExpertCatalogFromSdkworkAgents', () => {
  it('pages through the catalog and pushes experts, teams and personas', async () => {
    const { client } = fakeClient({
      divisions: [page([division])],
      // Two full one-item pages prove the loop keeps reading until a short page.
      experts: [page([expertA]), page([expertB]), page([])],
      teams: [page([team]), page([])],
      personas: { 'zh-CN': [page([personaZh])], 'en-US': [page([personaEn])] },
    })
    const { remote, calls } = fakeRemote()
    // A page size of 1 keeps every non-empty page full, so the loop reads on.
    const summary = await syncExpertCatalogFromSdkworkAgents({ client, remote, locale: 'zh-CN', pageSize: 1 })
    expect(summary).toEqual({ experts: 2, teams: 1, personas: 2 })

    const catalog = calls.find(call => call.method === 'catalog')!.payload as {
      experts: { slug: string; nameEn: string; divisionZh: string; custom: boolean }[]
      teams: { id: string; constraints: string; coordinatorTemplateVersion: number; members: unknown[] }[]
    }
    expect(catalog.experts.map(expert => expert.slug)).toEqual(['product-manager', 'design-ux-researcher'])
    expect(catalog.experts[0]).toMatchObject({ nameEn: '产品经理', divisionZh: '产品', custom: false })
    expect(catalog.experts[1]?.divisionZh).toBe('design')
    expect(catalog.teams[0]).toMatchObject({
      id: 'team-product',
      // The catalog's shared constraints reach the plugin overlay instead of
      // being dropped, so the team runtime prompt keeps them.
      constraints: '仅评审，不改文件',
      coordinatorTemplateVersion: 1,
    })
    expect(catalog.teams[0]?.members).toHaveLength(2)
    expect(calls.filter(call => call.method.startsWith('personas:'))).toHaveLength(2)
  })

  it('skips empty persona locales and rejects a Remote failure', async () => {
    const { client } = fakeClient({
      divisions: [page([division])],
      experts: [page([expertA])],
      teams: [page([team])],
      personas: { 'zh-CN': [page([])], 'en-US': [page([personaEn])] },
    })
    const { remote, calls } = fakeRemote({ failPersonas: true })
    await expect(syncExpertCatalogFromSdkworkAgents({ client, remote, locale: 'zh-CN', pageSize: 10 }))
      .rejects.toThrow('personas rejected')
    // The empty zh locale is not pushed; the en locale fails.
    expect(calls.filter(call => call.method === 'personas:zh-CN')).toHaveLength(0)
  })

  it('propagates a catalog Remote failure before touching personas', async () => {
    const { client } = fakeClient({
      divisions: [page([division])],
      experts: [page([expertA])],
      teams: [page([team])],
      personas: { 'zh-CN': [page([personaZh])], 'en-US': [page([])] },
    })
    const { remote, calls } = fakeRemote({ failCatalog: true })
    await expect(syncExpertCatalogFromSdkworkAgents({ client, remote, locale: 'zh-CN' })).rejects.toThrow('catalog rejected')
    expect(calls.some(call => call.method.startsWith('personas:'))).toBe(false)
  })

  it('stops paginating when a page is not full', async () => {
    const list = vi.fn(async () => page([expertA]))
    const client = {
      ai: {
        experts: { divisions: { list: async () => page([division]) }, list },
        expertTeams: { list: async () => page([team]) },
        expertPersonas: { list: async () => page([]) },
      },
    } as unknown as ExpertCatalogSdkClient
    const { remote } = fakeRemote()
    await syncExpertCatalogFromSdkworkAgents({ client, remote, locale: 'zh-CN', pageSize: 200 })
    expect(list).toHaveBeenCalledTimes(1)
  })
})
