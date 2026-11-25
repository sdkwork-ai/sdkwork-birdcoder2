import { describe, expect, it } from 'vitest'
import { createSdkworkCatalogSync } from '../src/sdkwork-catalog-sync.ts'
import type { ExpertSummary } from '../src/expert-contract.ts'
import type { SdkworkTeamInput } from '../src/sdkwork-catalog-sync.ts'

/** One expert summary in the wire shape the Agents App API serves. */
function expert(slug: string, division: string): ExpertSummary {
  return {
    slug,
    name: `${slug} zh`,
    nameEn: `${slug} en`,
    description: 'zh description',
    descriptionEn: 'en description',
    emoji: '🧩',
    division,
    divisionZh: division,
    custom: false,
  }
}

/** One two-member team in the wire shape the Agents App API serves. */
function team(id = 'team-product'): SdkworkTeamInput {
  const member = (expertSlug: string, duty: string) => ({
    expertSlug,
    duty,
    instructions: `${duty} instructions`,
  })
  return {
    id,
    name: '产品评审团',
    description: '评审产品方案',
    tags: ['评审'],
    goal: '评审',
    constraints: '只评审',
    deliveryRequirements: '清单',
    members: [member('product-manager', '需求'), member('engineering-software-architect', '成本')],
    examples: ['评审这份需求'],
    coordinatorMode: 'template',
    coordinatorTemplateId: 'product',
    coordinatorTemplateVersion: 1,
    coordinatorPrompt: '',
  }
}

describe('sdkwork catalog overlay', () => {
  it('starts empty so readers fall back to the bundled roster', () => {
    const sync = createSdkworkCatalogSync()
    expect(sync.experts()).toEqual([])
    expect(sync.teams()).toEqual([])
    expect(sync.persona('product-manager', 'zh-CN')).toBeUndefined()
    expect(sync.stats()).toEqual({ experts: 0, teams: 0, personas: 0 })
  })

  it('ingests experts, teams and personas and reads them back', () => {
    const sync = createSdkworkCatalogSync()
    expect(sync.ingestExperts([expert('product-manager', 'product')])).toBe(1)
    expect(sync.ingestTeams([team()])).toBe(1)
    expect(sync.ingestPersonas('zh-CN', [{ slug: 'product-manager', text: 'zh persona' }])).toBe(1)
    expect(sync.ingestPersonas('en-US', [{ slug: 'product-manager', text: 'en persona' }])).toBe(1)
    expect(sync.experts()).toHaveLength(1)
    expect(sync.experts()[0]?.slug).toBe('product-manager')
    expect(sync.teams()[0]?.id).toBe('team-product')
    expect(sync.teams()[0]?.builtin).toBe(true)
    expect(sync.persona('product-manager', 'zh-CN')).toBe('zh persona')
    expect(sync.persona('product-manager', 'en-US')).toBe('en persona')
    expect(sync.persona('product-manager', 'en')).toBe('en persona')
    expect(sync.stats()).toEqual({ experts: 1, teams: 1, personas: 2 })
  })

  it('falls back to the other locale when a persona is missing', () => {
    const sync = createSdkworkCatalogSync()
    sync.ingestPersonas('zh-CN', [{ slug: 'expert-a', text: 'zh' }])
    expect(sync.persona('expert-a', 'en-US')).toBe('zh')
    sync.ingestPersonas('en-US', [{ slug: 'expert-b', text: 'en' }])
    expect(sync.persona('expert-b', 'zh-CN')).toBe('en')
  })

  it('replaces the overlay on every ingest instead of merging stale rows', () => {
    const sync = createSdkworkCatalogSync()
    sync.ingestExperts([expert('a-expert', 'product'), expert('b-expert', 'product')])
    expect(sync.experts()).toHaveLength(2)
    sync.ingestExperts([expert('a-expert', 'product')])
    expect(sync.experts().map(entry => entry.slug)).toEqual(['a-expert'])
    sync.ingestTeams([team('team-product'), team('team-technical')])
    sync.ingestTeams([team('team-product')])
    expect(sync.teams().map(entry => entry.id)).toEqual(['team-product'])
  })

  it('rejects a team without an id and a team with fewer than two members', () => {
    const sync = createSdkworkCatalogSync()
    expect(() => sync.ingestTeams([{ ...team(), id: '' }])).toThrow(/missing its id/u)
    expect(() => sync.ingestTeams([{ ...team(), members: team().members.slice(0, 1) }])).toThrow()
  })

  it('rejects an expert summary whose required fields are missing', () => {
    const sync = createSdkworkCatalogSync()
    expect(() => sync.ingestExperts([{ slug: 'broken' } as never])).toThrow()
  })
})
