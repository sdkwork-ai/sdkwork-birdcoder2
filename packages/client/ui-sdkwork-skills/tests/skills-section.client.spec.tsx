// @vitest-environment jsdom
/**
 * Skills settings page spec: the page renders the catalog the store carries,
 * groups it by scenario with everything unlisted in one bucket, drives the
 * enable switch through the injected callback, discloses the per-row facts and
 * the suggestion switch only for skills that own a strip seat, filters by
 * name/description/alias, and reports the read-only, loading, error, no-session
 * and no-match states instead of painting an empty catalog. The page never
 * writes the preference itself — every switch forwards to the injected face.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SkillsSection, type SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import type { SkillCatalogRow, SkillsSectionState } from '../src/client/skills-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Locale seat stand-in: the real English dictionary, so assertions read copy. */
const t = ((key: string) => (en as Record<string, string>)[key]) as SkillsSectionProps['t']

/**
 * Two built-ins of one group, one built-in of another, and one unlisted skill:
 * the batch actions need a group with more than one row to mean anything, and
 * the two-group catalog is what proves a row-scoped or group-scoped query is
 * really scoped.
 */
const ROWS: readonly SkillCatalogRow[] = [
  { name: 'birdcoder-daily-dev', description: 'Everyday feature work.', whenToUse: 'Routine changes.', modelInvocable: true },
  { name: 'birdcoder-web-dev', description: 'Website work.', whenToUse: undefined, modelInvocable: true },
  { name: 'birdcoder-tts', description: 'Speech synthesis.', whenToUse: undefined, modelInvocable: false },
  { name: 'team-notes', description: 'Project-local skill.', whenToUse: undefined, modelInvocable: true },
]

/** The state every case starts from unless it says otherwise. */
function stateOf(overrides: Partial<SkillsSectionState> = {}): SkillsSectionState {
  return {
    status: 'ready',
    rows: ROWS,
    disabled: [],
    hiddenTags: [],
    writable: true,
    pending: [],
    ...overrides,
  }
}

/** Build the store-backed props the renderer would compose. */
function mount(overrides: Partial<SkillsSectionState> = {}) {
  const store = createSnapshotStore<SkillsSectionState>(stateOf(overrides))
  const injected = {
    setEnabled: vi.fn(),
    setTagHidden: vi.fn(),
    reload: vi.fn(),
  }
  // The shell composes the rest of the section runtime share (the global
  // standard props, the panel info, the owner's close affordance). This page
  // reads none of them, so the object is cast the way every section spec in the
  // repository casts it rather than faking services the page never touches.
  const props = {
    ...injected,
    // The shell-owned section affordance (SettingsSectionOwnerProps.close).
    close: vi.fn(),
    useStore: bindSnapshotSelector(store),
    t,
  } as unknown as SkillsSectionProps
  const view = render(<SkillsSection {...props} />)
  return { store, view, ...injected }
}

/** The row element carrying one skill. */
function rowOf(name: string): HTMLElement {
  const row = document.querySelector(`[data-skill="${name}"]`)
  if (row === null) throw new Error(`row not rendered: ${name}`)
  return row as HTMLElement
}

/** The group section whose heading reads as the given label. */
function groupOf(label: string): HTMLElement {
  const section = screen.getByRole('heading', { name: label, level: 3 }).closest('section')
  if (section === null) throw new Error(`group section not rendered: ${label}`)
  return section
}

/** The switches inside one row, in render order: the enable switch, then the tag switch. */
function switchesOf(name: string): readonly HTMLElement[] {
  return within(rowOf(name)).getAllByRole('switch')
}

/** The enable switch inside one row. */
function switchOf(name: string): HTMLElement {
  const enabled = switchesOf(name)[0]
  if (enabled === undefined) throw new Error(`enable switch not rendered: ${name}`)
  return enabled
}

/** The suggestion switch inside one disclosed row. */
function tagSwitchOf(name: string): HTMLElement {
  const tag = switchesOf(name)[1]
  if (tag === undefined) throw new Error(`suggestion switch not rendered: ${name}`)
  return tag
}

/** The disclosure button inside one row. */
function disclosureOf(name: string): HTMLElement {
  return within(rowOf(name)).getByRole('button', { name: en['row.expand'], hidden: true })
}

describe('SkillsSection', () => {
  it('groups the catalog by scenario and puts unlisted skills in their own bucket', () => {
    mount()

    expect(screen.getByRole('heading', { name: en['group.code'] })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en['group.media'] })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en['group.other'] })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: en['group.document'] })).toBeNull()
    // An empty group is not painted as an empty heading.
    expect(screen.getByText('/team-notes')).toBeTruthy()
  })

  it('shows the alias beside the wire token and counts the enabled skills', () => {
    mount({ disabled: ['birdcoder-tts'] })

    expect(screen.getByText('Daily dev')).toBeTruthy()
    expect(screen.getByText('/birdcoder-daily-dev')).toBeTruthy()
    // Four rows, one suppressed: the summary counts the other three.
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('drives the enable switch through the injected callback', () => {
    const { setEnabled } = mount()

    fireEvent.click(switchOf('birdcoder-daily-dev'))

    expect(setEnabled).toHaveBeenCalledWith('birdcoder-daily-dev', false)
    expect(switchOf('birdcoder-daily-dev').getAttribute('aria-checked')).toBe('true')
  })

  it('reflects a stored suppression instead of the click', () => {
    mount({ disabled: ['birdcoder-tts'] })

    expect(switchOf('birdcoder-tts').getAttribute('aria-checked')).toBe('false')
    expect(rowOf('birdcoder-tts').className).toContain('rowDisabled')
  })

  it('discloses the facts and the suggestion switch only for a strip seat', () => {
    mount()

    fireEvent.click(disclosureOf('birdcoder-daily-dev'))

    expect(switchesOf('birdcoder-daily-dev')).toHaveLength(2)
    expect(screen.getByText('Routine changes.')).toBeTruthy()
    expect(within(rowOf('birdcoder-daily-dev')).getByText(en['row.field.invoke.model'])).toBeTruthy()

    // The fact follows the catalog, not the group: a user-only skill says so.
    fireEvent.click(disclosureOf('birdcoder-tts'))
    expect(within(rowOf('birdcoder-tts')).getByText(en['row.field.invoke.user'])).toBeTruthy()

    // The unlisted skill is a skill like any other to the page, but it owns no
    // strip seat, so its disclosure carries no suggestion switch.
    fireEvent.click(disclosureOf('team-notes'))
    expect(switchesOf('team-notes')).toHaveLength(1)
  })

  it('routes the suggestion switch through its own callback', () => {
    const { setTagHidden } = mount()

    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    fireEvent.click(tagSwitchOf('birdcoder-daily-dev'))

    expect(setTagHidden).toHaveBeenCalledWith('birdcoder-daily-dev', true)
  })

  it('enables and disables a whole group through the batch actions', () => {
    const { setEnabled } = mount()

    fireEvent.click(within(groupOf(en['group.code'])).getByRole('button', { name: en['group.disableAll'] }))

    // Only the code group: the media and unlisted rows are untouched.
    expect(setEnabled).toHaveBeenCalledTimes(2)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-daily-dev', false)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-web-dev', false)
    expect(setEnabled).not.toHaveBeenCalledWith('birdcoder-tts', false)
  })

  it('filters by alias and by description, and reports an empty match', () => {
    mount()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    expect(screen.getByText('/birdcoder-tts')).toBeTruthy()
    expect(screen.queryByText('/team-notes')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-here' } })
    expect(screen.getByText(en['state.noMatch'])).toBeTruthy()
  })

  it('clears the query through the clear affordance', () => {
    mount()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    fireEvent.click(screen.getByRole('button', { name: en['search.clear'] }))

    expect(screen.getByText('/team-notes')).toBeTruthy()
  })

  it('locks the switches and says so on a read-only document', () => {
    mount({ writable: false })

    expect(screen.getByText(en['state.readOnly'])).toBeTruthy()
    expect(switchOf('birdcoder-daily-dev').hasAttribute('disabled')).toBe(true)
    const batch = within(groupOf(en['group.code'])).getByRole('button', { name: en['group.disableAll'] })
    expect(batch.hasAttribute('disabled')).toBe(true)
  })

  it('disables only the row whose write is in flight', () => {
    mount({ pending: ['birdcoder-daily-dev'] })

    expect(switchOf('birdcoder-daily-dev').hasAttribute('disabled')).toBe(true)
    expect(switchOf('birdcoder-tts').hasAttribute('disabled')).toBe(false)
  })

  it('states the missing session instead of an empty catalog', () => {
    mount({ status: 'idle', rows: [] })

    expect(screen.getByText(en['state.noSession'])).toBeTruthy()
  })

  it('states the empty project, not a failed search, when the catalog is empty', () => {
    mount({ status: 'ready', rows: [] })

    expect(screen.getByText(en['state.empty'])).toBeTruthy()
  })

  it('offers a retry after a failed fetch', () => {
    const { reload } = mount({ status: 'error' })

    fireEvent.click(screen.getByRole('button', { name: en['state.retry'] }))

    expect(reload).toHaveBeenCalled()
  })

  it('keeps the previous rows on screen while a reload is in flight', () => {
    mount({ status: 'loading' })

    expect(screen.getByText('/birdcoder-daily-dev')).toBeTruthy()
    expect(screen.getByRole('button', { name: en['reload'] }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the loading state when nothing has ever loaded', () => {
    mount({ status: 'loading', rows: [] })

    expect(screen.getByText(en['state.loading'])).toBeTruthy()
  })
})
