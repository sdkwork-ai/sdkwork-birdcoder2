// @vitest-environment jsdom
/**
 * Expert gallery panel: the reference gallery's browsing affordances render
 * over the roster the panel reads from its Remote. This spec mounts the real
 * `AgencySettingsPanel` with a fake roster and asserts the category chip rail,
 * the sort control and the 专家 / 专家团 tabs are user-visible and interactive.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AgencySettingsPanel } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

const experts = [
  {
    slug: 'product-manager', name: '产品经理', nameEn: 'Product Manager',
    description: '负责需求与路线图。', descriptionEn: 'Owns requirements and the roadmap.',
    emoji: '🧩', division: 'product', divisionZh: '产品设计', custom: false,
  },
  {
    slug: 'engineering-architect', name: '软件架构师', nameEn: 'Software Architect',
    description: '负责架构与交付风险。', descriptionEn: 'Owns architecture and delivery risk.',
    emoji: '🏗️', division: 'engineering', divisionZh: '技术工程', custom: false,
  },
]

/** A Remote double with one enabled expert and no teams. */
function fakeRemote() {
  return {
    getCatalog: async () => ({ ok: true as const, value: { experts, enabled: ['product-manager'], revision: 1 } }),
    getEnabled: async () => ({ ok: true as const, value: { enabled: ['product-manager'], revision: 1 } }),
    getTeams: async () => ({ ok: true as const, value: { teams: [], enabledTeams: [], enabledExperts: [], revision: 1 } }),
    getPrompt: async () => ({ ok: true as const, value: { prompt: 'prompt' } }),
    setEnabled: async (enabled: string[], revision: number) => ({ ok: true as const, value: { enabled, revision: revision + 1 } }),
    getCustomExpert: async () => ({ ok: false as const, error: { message: 'missing' } }),
    saveCustomExpert: async () => ({ ok: true as const, value: { experts, enabled: [], revision: 2 } }),
    deleteCustomExpert: async () => ({ ok: true as const, value: { experts, enabled: [], revision: 2 } }),
    saveTeam: async () => ({ ok: true as const, value: { teams: [], enabledTeams: [], enabledExperts: [], revision: 2 } }),
    setTeamEnabled: async () => ({ ok: true as const, value: { teams: [], enabledTeams: [], enabledExperts: [], revision: 2 } }),
    deleteTeam: async () => ({ ok: true as const, value: { teams: [], enabledTeams: [], enabledExperts: [], revision: 2 } }),
    syncSdkworkCatalog: async () => ({ ok: true as const, value: { experts: 0, teams: 0 } }),
    syncSdkworkPersonas: async () => ({ ok: true as const, value: { count: 0 } }),
  }
}

function panelProps() {
  return {
    t: makeTranslate(zh),
    remote: fakeRemote(),
    getActive: () => 'zh' as const,
    getLocale: () => 'zh-CN',
    getTeamLocale: () => 'zh' as const,
    prepareTeamSelection: () => () => true,
    onEnabledChange: () => {},
    onSummary: () => {},
    closeSettings: () => {},
  }
}

afterEach(() => { cleanup() })

describe('expert gallery panel', () => {
  it('renders the category chip rail and the sort control over the roster', async () => {
    render(<AgencySettingsPanel {...(panelProps() as never)} />)
    const category = await screen.findByRole('group', { name: '分类' })
    expect(within(category).getByRole('button', { name: '全部分类' })).toBeTruthy()
    expect(within(category).getByRole('button', { name: '产品' })).toBeTruthy()
    expect(within(category).getByRole('button', { name: '工程' })).toBeTruthy()

    const sort = screen.getByRole('group', { name: '排序' })
    expect(within(sort).getByRole('button', { name: '综合' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(sort).getByRole('button', { name: '名称' }))
    expect(within(sort).getByRole('button', { name: '名称' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sort).getByRole('button', { name: '综合' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('filters by a category chip and keeps the 专家 / 专家团 tabs', async () => {
    render(<AgencySettingsPanel {...(panelProps() as never)} />)
    const category = await screen.findByRole('group', { name: '分类' })
    const product = within(category).getByRole('button', { name: '产品' })
    fireEvent.click(product)
    expect(product.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(product)
    expect(product.getAttribute('aria-pressed')).toBe('false')

    expect(screen.getByText('专家团')).toBeTruthy()
  })
})
