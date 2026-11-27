// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import {
  type PageInfo,
  type SkillArtifactRecord,
  type SkillArtifactsPageData,
  type SkillCategoryRecord,
  type SkillCategoriesPageData,
  type SkillInstallationRecord,
  type SkillInstallationsPageData,
  type SkillRecord,
  type SkillsPageData,
} from '@sdkwork/skills-app-sdk'
import {
  SkillsCatalogPage,
  type SkillsCatalogActions,
  type SkillsCatalogPageProps,
} from '../src/client/SkillsCatalogPage.tsx'

const t: SkillsCatalogPageProps['t'] = key => key

// The catalog follows `hasMore` until it turns false, so every response must
// report its own page; a fixed `page: 1, hasMore: true` never terminates.
function pageInfo(page = 1, totalPages = 1): PageInfo {
  return { mode: 'offset', page, pageSize: 48, totalPages, hasMore: page < totalPages }
}

function skillsPage(items: SkillRecord[], totalPages = 1, page = 1): SkillsPageData {
  return { items, pageInfo: pageInfo(page, totalPages) }
}

function categoriesPage(items: SkillCategoryRecord[]): SkillCategoriesPageData {
  return { items, pageInfo: pageInfo() }
}

function installationsPage(items: SkillInstallationRecord[]): SkillInstallationsPageData {
  return { items, pageInfo: pageInfo() }
}

function artifactsPage(items: SkillArtifactRecord[], totalPages = 1, page = 1): SkillArtifactsPageData {
  return { items, pageInfo: pageInfo(page, totalPages) }
}

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'skill-alpha',
    uuid: 'uuid-alpha',
    tenantId: 'tenant',
    organizationId: 'org',
    skillKey: 'alpha',
    packageId: 'package-alpha',
    name: 'Alpha',
    summary: 'Alpha summary',
    description: 'Alpha description',
    marketStatus: 'published',
    visibility: 'public',
    reviewStatus: 'approved',
    categories: ['design'],
    enabled: true,
    featured: false,
    installCount: '2',
    tags: ['writing'],
    allowedRoleCodes: [],
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function category(overrides: Partial<SkillCategoryRecord> = {}): SkillCategoryRecord {
  return {
    id: 'category-design',
    uuid: 'uuid-category-design',
    tenantId: 'tenant',
    organizationId: 'org',
    categoryType: 'skill_market',
    code: 'design',
    name: 'Design',
    sortWeight: 10,
    permissionCode: 'skills.read',
    visible: true,
    status: 1,
    version: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function installation(overrides: Partial<SkillInstallationRecord> = {}): SkillInstallationRecord {
  return {
    id: 'installation-alpha',
    uuid: 'uuid-installation-alpha',
    tenantId: 'tenant',
    organizationId: 'org',
    subjectKind: 'user',
    subjectId: 'user',
    skillId: 'skill-alpha',
    packageId: 'package-alpha',
    artifactId: 'artifact-alpha',
    installedByUserId: 'user',
    installStatus: 'installed',
    enabled: true,
    config: {},
    version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function artifact(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  return {
    id: 'artifact-alpha',
    uuid: 'uuid-artifact-alpha',
    tenantId: 'tenant',
    packageId: 'package-alpha',
    versionLabel: '1.0.0',
    source: { kind: 'git', repositoryUrl: 'https://fixture.example/skills.git', repositoryPath: '.' },
    invocationKind: 'local-workflow',
    entrypoint: 'SKILL.md',
    inputSchema: {},
    outputSchema: {},
    configSchema: {},
    defaultConfig: {},
    status: 'published',
    capabilityKeys: [],
    publishedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function catalogClient() {
  const marketplace = vi.fn<SkillsCatalogActions['listMarketplace']>()
    .mockResolvedValue(skillsPage([skill()]))
  const categories = vi.fn<SkillsCatalogActions['listCategories']>()
    .mockResolvedValue(categoriesPage([category()]))
  const installations = vi.fn<SkillsCatalogActions['listInstallations']>()
    .mockResolvedValue(installationsPage([]))
  const artifacts = vi.fn<SkillsCatalogActions['listArtifacts']>()
    .mockResolvedValue(artifactsPage([artifact()]))
  const createInstallation = vi.fn<SkillsCatalogActions['createInstallation']>()
    .mockResolvedValue(installation())
  const actions: SkillsCatalogActions = {
    listMarketplace: marketplace,
    listCategories: categories,
    listInstallations: installations,
    listArtifacts: artifacts,
    createInstallation,
  }
  return { actions, marketplace, categories, installations, artifacts, createInstallation }
}

function catalogProps(
  mocks: ReturnType<typeof catalogClient>,
  overrides: Partial<SkillsCatalogPageProps> = {},
): SkillsCatalogPageProps {
  return {
    actions: mocks.actions,
    locale: 'en',
    t,
    dispatchPrompt: vi.fn(),
    onImportSkill: vi.fn(),
    onAdded: vi.fn(),
    onAddFailed: vi.fn(),
    ...overrides,
  }
}

function recommended(view: ReturnType<typeof render>) {
  const section = view.getByRole('heading', { name: 'skills.catalog.recommended' }).closest('section')
  if (section === null) throw new Error('Recommended section is missing')
  return within(section)
}

async function waitForCards(view: ReturnType<typeof render>) {
  await waitFor(() => { expect(view.container.querySelector('[data-skill-card]')).not.toBeNull() })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SkillsCatalogPage', () => {
  it('loads every marketplace page and hides inactive categories', async () => {
    const mocks = catalogClient()
    mocks.marketplace.mockImplementation(async params => params?.page === 1
      ? skillsPage([skill(), skill({ id: 'skill-beta', name: 'Beta', packageId: 'package-beta' })], 2, 1)
      : skillsPage([skill({ id: 'skill-gamma', name: 'Gamma', packageId: 'package-gamma', featured: true })], 2, 2))
    mocks.categories.mockResolvedValue(categoriesPage([
      category(),
      category({ id: 'hidden', code: 'hidden', name: 'Hidden', visible: false }),
      category({ id: 'disabled', code: 'disabled', name: 'Disabled', status: 0 }),
      category({ id: 'collection', code: 'collection', name: 'Collection', categoryType: 'skills_collection' }),
    ]))

    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)
    await waitForCards(view)

    expect(mocks.marketplace).toHaveBeenCalledTimes(2)
    expect(mocks.categories).toHaveBeenCalledWith({ page: 1, pageSize: 200, categoryType: 'skill_market' }, expect.anything())
    expect(view.queryByRole('button', { name: 'Hidden' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Disabled' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Collection' })).toBeNull()
    expect(recommended(view).getByRole('button', { name: 'Gamma' })).toBeTruthy()
    const featured = view.getByRole('heading', { name: 'skills.catalog.featured' }).closest('section')
    expect(featured?.querySelectorAll('[data-skill-card]')).toHaveLength(1)
  })

  it('sends debounced search and category filters to the server', async () => {
    const mocks = catalogClient()
    const view = render(<SkillsCatalogPage {...catalogProps(mocks, { searchQuery: '' })} />)
    await waitForCards(view)
    mocks.marketplace.mockClear()

    view.rerender(<SkillsCatalogPage {...catalogProps(mocks, { searchQuery: '  docs  ' })} />)
    await waitFor(() => {
      expect(mocks.marketplace).toHaveBeenCalledWith({ page: 1, pageSize: 48, q: 'docs' }, expect.anything())
    })

    fireEvent.click(view.getByRole('button', { name: 'Design' }))
    await waitFor(() => {
      expect(mocks.marketplace).toHaveBeenCalledWith(
        { page: 1, pageSize: 48, q: 'docs', categoryCode: 'design' },
        expect.anything(),
      )
    })
  })

  it('sorts by installs and newest with keyboard navigation', async () => {
    const mocks = catalogClient()
    mocks.marketplace.mockResolvedValue(skillsPage([
      skill({ id: 'alpha', name: 'Alpha', installCount: '2', updatedAt: '2026-01-01T00:00:00Z' }),
      skill({ id: 'beta', name: 'Beta', packageId: 'package-beta', installCount: '10', updatedAt: '2026-03-01T00:00:00Z' }),
      skill({ id: 'gamma', name: 'Gamma', packageId: 'package-gamma', installCount: '5', updatedAt: '2026-02-01T00:00:00Z' }),
    ]))
    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)
    await waitForCards(view)

    const cards = () => Array.from(view.container.querySelectorAll(
      '[aria-labelledby="skills-recommended-title"] [data-skill-card]',
    ))
    expect(cards().map(card => card.getAttribute('data-skill-card'))).toEqual(['alpha', 'beta', 'gamma'])

    const comprehensive = view.getByRole('tab', { name: 'skills.catalog.sort.comprehensive' })
    comprehensive.focus()
    fireEvent.keyDown(comprehensive, { key: 'ArrowRight' })
    const installs = view.getByRole('tab', { name: 'skills.catalog.sort.installs' })
    expect(installs.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(installs)
    expect(cards().map(card => card.getAttribute('data-skill-card'))).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.keyDown(installs, { key: 'End' })
    const newest = view.getByRole('tab', { name: 'skills.catalog.sort.latest' })
    expect(newest.getAttribute('aria-selected')).toBe('true')
    expect(cards().map(card => card.getAttribute('data-skill-card'))).toEqual(['beta', 'gamma', 'alpha'])
  })

  it('joins installations by package id and filters to installed skills', async () => {
    const mocks = catalogClient()
    const translate = vi.fn<SkillsCatalogPageProps['t']>(key => key)
    mocks.marketplace.mockResolvedValue(skillsPage([
      skill(),
      skill({ id: 'skill-beta', name: 'Beta', packageId: 'package-beta' }),
    ]))
    mocks.installations.mockResolvedValue(installationsPage([
      installation({ id: 'installation-alpha-1', skillId: 'another-skill', packageId: 'package-alpha' }),
      installation({ id: 'installation-alpha-2', skillId: 'duplicate-skill', packageId: 'package-alpha' }),
    ]))
    const view = render(<SkillsCatalogPage {...catalogProps(mocks, { t: translate })} />)
    await waitForCards(view)

    expect(translate).toHaveBeenCalledWith('skills.catalog.installedCount', { count: '1' })
    const filter = view.getByRole('button', { name: 'skills.catalog.installedCount' })
    fireEvent.click(filter)
    expect(filter.getAttribute('aria-pressed')).toBe('true')
    expect(recommended(view).getAllByRole('button', { name: 'Alpha' })).toHaveLength(1)
    expect(recommended(view).queryByRole('button', { name: 'Beta' })).toBeNull()
    expect(recommended(view).getByRole('button', { name: 'skills.catalog.added' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps categories and installed state while a filtered reload is pending', async () => {
    const mocks = catalogClient()
    mocks.installations.mockResolvedValue(installationsPage([installation()]))
    let settleReload: ((value: SkillsPageData) => void) | undefined
    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)
    await waitForCards(view)
    fireEvent.click(recommended(view).getByRole('button', { name: 'Alpha' }))
    const dialog = await view.findByRole('dialog')

    mocks.marketplace.mockReturnValue(new Promise((resolve) => { settleReload = resolve }))
    fireEvent.click(view.getByRole('button', { name: 'Design' }))
    await waitFor(() => { expect(mocks.marketplace).toHaveBeenCalledTimes(2) })

    expect(view.getByRole('button', { name: 'Design' })).toBeTruthy()
    const added = within(dialog).getByRole('button', { name: 'skills.catalog.added' })
    expect(added.hasAttribute('disabled')).toBe(true)
    await act(async () => { settleReload?.(skillsPage([skill()])) })
  })

  it('adds the exact published version once and reflects the cloud installation', async () => {
    const mocks = catalogClient()
    mocks.artifacts.mockImplementation(async (_packageId, params) => params?.page === 1
      ? artifactsPage([artifact({ id: 'wrong-version', versionLabel: '0.9.0' })], 2, 1)
      : artifactsPage([artifact()], 2, 2))
    let settleInstallation: ((value: SkillInstallationRecord) => void) | undefined
    mocks.createInstallation.mockReturnValue(new Promise((resolve) => { settleInstallation = resolve }))
    const onAdded = vi.fn()
    const props = catalogProps(mocks, { onAdded })
    const view = render(<SkillsCatalogPage {...props} />)
    await waitForCards(view)

    const add = recommended(view).getByRole('button', { name: 'skills.catalog.addAria' })
    fireEvent.click(add)
    await waitFor(() => { expect(mocks.createInstallation).toHaveBeenCalledTimes(1) })
    expect(mocks.artifacts).toHaveBeenCalledTimes(2)
    expect(mocks.createInstallation).toHaveBeenCalledTimes(1)
    expect(mocks.artifacts).toHaveBeenCalledTimes(2)
    expect(mocks.createInstallation.mock.calls[0]?.slice(0, 2)).toEqual([
      'package-alpha',
      { artifactId: 'artifact-alpha' },
    ])
    expect(mocks.createInstallation.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal)
    expect(add.hasAttribute('disabled')).toBe(true)
    fireEvent.click(add)
    expect(mocks.createInstallation).toHaveBeenCalledTimes(1)

    await act(async () => { settleInstallation?.(installation()) })
    await waitFor(() => { expect(onAdded).toHaveBeenCalledWith('Alpha') })
    expect(view.queryByRole('status')).toBeNull()
    expect(recommended(view).getByRole('button', { name: 'skills.catalog.added' }).hasAttribute('disabled')).toBe(true)
  })

  it('does not add when the exact published artifact is missing', async () => {
    const mocks = catalogClient()
    mocks.artifacts.mockResolvedValue(artifactsPage([
      artifact({ id: 'old', versionLabel: '0.9.0' }),
      artifact({ id: 'draft', versionLabel: '1.0.0', status: 'draft' }),
    ]))
    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)
    await waitForCards(view)

    fireEvent.click(recommended(view).getByRole('button', { name: 'skills.catalog.addAria' }))
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('skills.catalog.missingArtifact') })
    expect(mocks.createInstallation).not.toHaveBeenCalled()
    expect(recommended(view).getByRole('button', { name: 'skills.catalog.addAria' }).hasAttribute('disabled')).toBe(false)
  })

  it('reports an add failure and re-enables the action', async () => {
    const mocks = catalogClient()
    mocks.createInstallation.mockRejectedValue(new Error('offline'))
    const onAddFailed = vi.fn()
    const view = render(<SkillsCatalogPage {...catalogProps(mocks, { onAddFailed })} />)
    await waitForCards(view)

    const add = recommended(view).getByRole('button', { name: 'skills.catalog.addAria' })
    fireEvent.click(add)
    await waitFor(() => { expect(onAddFailed).toHaveBeenCalledTimes(1) })
    expect(view.queryByRole('alert')).toBeNull()
    expect(add.hasAttribute('disabled')).toBe(false)
  })

  it('shows a retry state after an initial load failure', async () => {
    const mocks = catalogClient()
    mocks.marketplace.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(skillsPage([skill()]))
    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)

    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('network down') })
    fireEvent.click(view.getByRole('button', { name: 'skills.catalog.retry' }))
    await waitForCards(view)
    expect(mocks.marketplace).toHaveBeenCalledTimes(2)
  })

  it('offers to clear all filters from the empty state', async () => {
    const mocks = catalogClient()
    mocks.marketplace.mockResolvedValue(skillsPage([]))
    const onClearSearch = vi.fn()
    const view = render(
      <SkillsCatalogPage {...catalogProps(mocks, { searchQuery: 'missing', onClearSearch })} />,
    )

    await waitFor(() => { expect(view.getByRole('heading', { name: 'skills.catalog.emptyTitle' })).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: 'skills.catalog.clearFilters' }))
    expect(onClearSearch).toHaveBeenCalledTimes(1)
  })

  it('opens skill details with description, version, and tags', async () => {
    const mocks = catalogClient()
    mocks.marketplace.mockResolvedValue(skillsPage([
      skill({ description: 'Full description', tags: ['writing', 'office'] }),
    ]))
    const view = render(<SkillsCatalogPage {...catalogProps(mocks)} />)
    await waitForCards(view)

    fireEvent.click(recommended(view).getByRole('button', { name: 'Alpha' }))
    const dialog = await view.findByRole('dialog')
    expect(within(dialog).getByText('Full description')).toBeTruthy()
    expect(within(dialog).getByText('1.0.0')).toBeTruthy()
    expect(within(dialog).getByText('writing')).toBeTruthy()
    expect(within(dialog).getByText('office')).toBeTruthy()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'dialog.close' })[0])
    await waitFor(() => { expect(view.queryByRole('dialog')).toBeNull() })
  })
})
