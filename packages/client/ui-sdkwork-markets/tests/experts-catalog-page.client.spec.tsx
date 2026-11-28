// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import {
  ExpertsCatalogPage,
  formatExpertUsage,
  type ExpertCollectionRecord,
  type ExpertDivisionRecord,
  type ExpertRecord,
  type ExpertsCatalogActions,
  type ExpertsPageData,
  type ExpertTeamRecord,
} from '../src/client/ExpertsCatalogPage.tsx'

/** The magnitude words the usage formatter asks the dictionary for. */
const UNITS: Record<string, string> = {
  'experts.catalog.unit.tenThousand': '万',
  'experts.catalog.unit.thousand': 'K',
  'experts.catalog.unit.million': 'M',
}

const t = (key: string, params?: Record<string, unknown>): string => {
  const text = UNITS[key] ?? key
  return params === undefined ? text : Object.entries(params).reduce(
    (result, [name, value]) => result.replace(`{${name}}`, String(value)),
    text,
  )
}

function pages<T>(items: T[]): ExpertsPageData<T> {
  return { items, pageInfo: { page: 1, pageSize: 200, hasMore: false } }
}

function division(overrides: Partial<ExpertDivisionRecord> = {}): ExpertDivisionRecord {
  return { code: 'engineering', name: 'Engineering', sortOrder: 10, expertCount: 2, ...overrides }
}

function expert(overrides: Partial<ExpertRecord> = {}): ExpertRecord {
  return {
    slug: 'engineering-code-reviewer',
    agentId: 'agent.expert.engineering-code-reviewer',
    name: 'Code reviewer',
    description: 'Reviews a change for correctness.',
    emoji: '🔍',
    divisionCode: 'engineering',
    tags: ['review', 'quality'],
    usageCount: 12_000,
    badgeCode: null,
    sortOrder: 0,
    publishedAt: null,
    ...overrides,
  }
}

function team(overrides: Partial<ExpertTeamRecord> = {}): ExpertTeamRecord {
  return {
    teamId: 'team-product',
    name: 'Product review team',
    description: 'Reviews a product plan from four angles.',
    tags: ['product'],
    goal: 'Ship a reviewed plan.',
    constraints: 'Review only; report gaps instead of editing.',
    deliveryRequirements: 'One reviewed plan.',
    examples: [],
    coordinatorMode: 'template',
    coordinatorTemplateId: 'product',
    locale: 'zh-CN',
    members: [
      { expertSlug: 'product-manager', expertAgentId: 'agent.expert.product-manager', duty: 'scope', instructions: 'scope it' },
      { expertSlug: 'designer', expertAgentId: 'agent.expert.designer', duty: 'flows', instructions: 'draw it' },
    ],
    ...overrides,
  }
}

function collection(overrides: Partial<ExpertCollectionRecord> = {}): ExpertCollectionRecord {
  return {
    collectionCode: 'collection-ecommerce',
    name: '电商运营',
    nameEn: 'E-commerce',
    description: '店铺与直播',
    descriptionEn: 'Storefronts',
    coverKey: 'collection-ecommerce',
    sortOrder: 10,
    experts: [
      {
        expertSlug: 'engineering-code-reviewer',
        expertAgentId: 'agent.expert.engineering-code-reviewer',
        label: 'Code reviewer',
        labelEn: 'Code reviewer',
      },
    ],
    ...overrides,
  }
}

interface CatalogFixture {
  divisions?: ExpertDivisionRecord[]
  experts?: ExpertRecord[]
  teams?: ExpertTeamRecord[]
  collections?: ExpertCollectionRecord[]
}

function actions(fixture: CatalogFixture = {}): ExpertsCatalogActions & { listCollections: ReturnType<typeof vi.fn> } {
  return {
    listDivisions: vi.fn(async () => pages(fixture.divisions ?? [division()])),
    listExperts: vi.fn(async () => pages(fixture.experts ?? [expert()])),
    listTeams: vi.fn(async () => pages(fixture.teams ?? [team()])),
    listCollections: vi.fn(async () => pages(fixture.collections ?? [collection()])),
  } as ExpertsCatalogActions & { listCollections: ReturnType<typeof vi.fn> }
}

afterEach(() => { cleanup() })

describe('formatExpertUsage', () => {
  it('uses the market unit of each locale', () => {
    expect(formatExpertUsage(28_021_200, 'zh-CN', t)).toBe('2802.12 万')
    expect(formatExpertUsage(28_021_200, 'en-US', t)).toBe('28.02M')
    expect(formatExpertUsage(4_300, 'en-US', t)).toBe('4.3K')
    expect(formatExpertUsage(0, 'zh-CN', t)).toBe('0')
  })
})

describe('ExpertsCatalogPage', () => {
  it('renders the curated shelf, the division chips and the expert cards from the catalog', async () => {
    const catalog = actions({
      divisions: [division(), division({ code: 'design', name: 'Design', sortOrder: 20, expertCount: 1 })],
      experts: [
        expert(),
        expert({ slug: 'designer', name: 'Designer', divisionCode: 'design', emoji: '🎨', usageCount: 900 }),
      ],
    })
    const view = render(<ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} />)

    await waitFor(() => { expect(view.container.querySelectorAll('[data-expert-card]').length).toBe(2) })
    // The featured shelf leads, with its curated links.
    expect(view.getByText('电商运营')).toBeTruthy()
    expect(view.getByRole('button', { name: /Code reviewer/ })).toBeTruthy()
    // The division chips carry the counts the catalog reports.
    const categories = view.getByRole('group', { name: 'experts.catalog.categories.label' })
    expect(within(categories).getByRole('button', { name: 'experts.catalog.category.all' })).toBeTruthy()
    expect(within(categories).getByText('Engineering')).toBeTruthy()
    // The card shows the usage statistic the catalog curates, not a guess.
    expect(within(view.container.querySelector('[data-expert-card]') as HTMLElement).getByText('experts.catalog.usage'))
      .toBeTruthy()
    // The 专家 / 专家团 switch and the sort capsule are both present.
    expect(view.getByRole('tablist', { name: 'experts.catalog.view.label' })).toBeTruthy()
    expect(view.getByRole('tablist', { name: 'experts.catalog.sort.label' })).toBeTruthy()
  })

  it('filters by a division chip and by the page header query', async () => {
    const catalog = actions({
      divisions: [division(), division({ code: 'design', name: 'Design', sortOrder: 20, expertCount: 1 })],
      experts: [
        expert(),
        expert({ slug: 'designer', name: 'Designer', divisionCode: 'design', description: 'Draws flows.' }),
      ],
    })
    const view = render(<ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} searchQuery="" />)
    await waitFor(() => { expect(view.container.querySelectorAll('[data-expert-card]').length).toBe(2) })

    fireEvent.click(view.getByRole('button', { name: /Design/ }))
    await waitFor(() => { expect(view.container.querySelectorAll('[data-expert-card]').length).toBe(1) })
    expect(view.container.querySelector('[data-expert-card]')!.getAttribute('data-expert-card')).toBe('designer')
    // Clicking the same chip clears the facet.
    fireEvent.click(view.getByRole('button', { name: /Design/ }))
    await waitFor(() => { expect(view.container.querySelectorAll('[data-expert-card]').length).toBe(2) })

    // The header owns the search text; the page obeys it after the debounce.
    view.rerender(<ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} searchQuery="draws" />)
    await waitFor(() => { expect(view.container.querySelectorAll('[data-expert-card]').length).toBe(1) })
    expect(view.container.querySelector('[data-expert-card]')!.getAttribute('data-expert-card')).toBe('designer')
  })

  it('orders by the curated ranking, all-time usage and publication time', async () => {
    const catalog = actions({
      experts: [
        expert({ slug: 'alpha', name: 'Alpha', sortOrder: 2, usageCount: 5, publishedAt: '2026-01-01T00:00:00Z' }),
        expert({ slug: 'beta', name: 'Beta', sortOrder: 0, usageCount: 900, publishedAt: null }),
        expert({ slug: 'gamma', name: 'Gamma', sortOrder: 1, usageCount: 40, publishedAt: '2026-06-01T00:00:00Z' }),
      ],
    })
    const view = render(<ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} />)
    const slugs = (): (string | null)[] => Array.from(view.container.querySelectorAll('[data-expert-card]'))
      .map(node => node.getAttribute('data-expert-card'))
    await waitFor(() => { expect(slugs()).toEqual(['beta', 'gamma', 'alpha']) })

    fireEvent.click(view.getByRole('tab', { name: 'experts.catalog.sort.popular' }))
    await waitFor(() => { expect(slugs()).toEqual(['beta', 'gamma', 'alpha']) })
    expect(slugs()).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.click(view.getByRole('tab', { name: 'experts.catalog.sort.latest' }))
    await waitFor(() => { expect(slugs()).toEqual(['gamma', 'alpha', 'beta']) })
  })

  it('switches to the expert teams and says how many experts each team staffs', async () => {
    const catalog = actions()
    const view = render(<ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} />)
    await waitFor(() => { expect(view.container.querySelector('[data-expert-card]')).not.toBeNull() })

    fireEvent.click(view.getByRole('tab', { name: /experts.catalog.view.teams/ }))
    await waitFor(() => { expect(view.container.querySelector('[data-team-card]')).not.toBeNull() })
    const card = view.container.querySelector('[data-team-card]') as HTMLElement
    expect(card.getAttribute('data-team-card')).toBe('team-product')
    // A team card says how many experts it coordinates instead of a usage
    // statistic, because a team's value is its staffing.
    expect(within(card).getByText('experts.catalog.memberCount')).toBeTruthy()
    expect(view.container.querySelector('[data-expert-card]')).toBeNull()
  })

  it('opens one expert from the shelf or the grid and starts it from the dialog', async () => {
    const onUseExpert = vi.fn()
    const catalog = actions()
    const view = render(
      <ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} onUseExpert={onUseExpert} />,
    )
    await waitFor(() => { expect(view.container.querySelector('[data-expert-card]')).not.toBeNull() })

    // The shelf's link resolves the curated slug against the loaded catalog.
    fireEvent.click(view.getByRole('button', { name: /Code reviewer/ }))
    const dialog = await view.findByRole('dialog')
    expect(within(dialog).getByText('Reviews a change for correctness.')).toBeTruthy()
    // The dialog names the division the way the chip rail does, not by its code.
    expect(within(dialog).getByText('Engineering')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'experts.catalog.use' }))
    expect(onUseExpert).toHaveBeenCalledWith(expect.objectContaining({ slug: 'engineering-code-reviewer' }))

    // The card's own action starts the expert without opening the dialog.
    fireEvent.click(view.getAllByRole('button', { name: 'experts.catalog.use' })[0])
    expect(onUseExpert).toHaveBeenCalledTimes(2)
  })

  it('starts one team from its card and from the dialog', async () => {
    const onUseTeam = vi.fn()
    const catalog = actions()
    const view = render(
      <ExpertsCatalogPage actions={catalog} locale="zh-CN" t={t} onUseTeam={onUseTeam} />,
    )
    await waitFor(() => { expect(view.container.querySelector('[data-expert-card]')).not.toBeNull() })
    fireEvent.click(view.getByRole('tab', { name: /experts.catalog.view.teams/ }))
    await waitFor(() => { expect(view.container.querySelector('[data-team-card]')).not.toBeNull() })

    fireEvent.click(view.getByRole('button', { name: 'experts.catalog.useTeam' }))
    expect(onUseTeam).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-product' }))

    fireEvent.click(view.getByRole('button', { name: 'experts.catalog.openTeam' }))
    const dialog = await view.findByRole('dialog')
    expect(within(dialog).getByText('scope')).toBeTruthy()
    // A team's dialog states the shared constraints and the delivery
    // requirement, because the team runtime prompt is built from them.
    expect(within(dialog).getByText('Review only; report gaps instead of editing.')).toBeTruthy()
    expect(within(dialog).getByText('One reviewed plan.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'experts.catalog.useTeam' }))
    expect(onUseTeam).toHaveBeenCalledTimes(2)
  })

  it('reports a failed load and retries it', async () => {
    const failing = {
      listDivisions: vi.fn(async () => { throw new Error('gateway down') }),
      listExperts: vi.fn(async () => pages([])),
      listTeams: vi.fn(async () => pages([])),
      listCollections: vi.fn(async () => pages([])),
    } as unknown as ExpertsCatalogActions
    const view = render(<ExpertsCatalogPage actions={failing} locale="zh-CN" t={t} />)
    const alert = await view.findByRole('alert')
    expect(within(alert).getByText('gateway down')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'experts.catalog.retry' }))
    await waitFor(() => { expect(failing.listDivisions).toHaveBeenCalledTimes(2) })
  })

  it('offers to clear the filters when nothing matches', async () => {
    const onClearSearch = vi.fn()
    const catalog = actions()
    const view = render(
      <ExpertsCatalogPage
        actions={catalog}
        locale="zh-CN"
        t={t}
        searchQuery="nothing-matches-this"
        onClearSearch={onClearSearch}
      />,
    )
    await view.findByText('experts.catalog.empty.title')
    fireEvent.click(view.getByRole('button', { name: 'experts.catalog.clearFilters' }))
    expect(onClearSearch).toHaveBeenCalledTimes(1)
  })
})
