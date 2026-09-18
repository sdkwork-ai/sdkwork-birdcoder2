// @vitest-environment jsdom
/**
 * Skills settings page spec: the page renders the catalog the store carries,
 * groups it by scenario with everything unlisted in one bucket, drives the
 * enable switch through the injected callback, discloses the per-row facts and
 * the suggestion switch for *every* row (a project skill must not be denied the
 * affordance just because no scene table places it), filters by
 * name/description/provider/alias, reports the root class each row came from,
 * and states the read-only, loading, global, error, cold-start and no-match
 * conditions instead of painting an empty catalog. The page never writes the
 * preference itself — every switch forwards to the injected face.
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
 * really scoped. The unlisted row carries a non-bundled root so the source
 * column has something to say.
 */
const ROWS: readonly SkillCatalogRow[] = [
  {
    name: 'birdcoder-daily-dev', description: 'Everyday feature work.', whenToUse: 'Routine changes.',
    modelInvocable: true, userInvocable: true, source: 'bundled', provider: 'sdkwork-builtin',
  },
  {
    name: 'birdcoder-web-dev', description: 'Website work.', whenToUse: undefined,
    modelInvocable: true, userInvocable: true, source: 'bundled', provider: 'sdkwork-builtin',
  },
  {
    name: 'birdcoder-tts', description: 'Speech synthesis.', whenToUse: undefined,
    modelInvocable: false, userInvocable: true, source: 'bundled', provider: 'sdkwork-builtin',
  },
  {
    name: 'team-notes', description: 'Project-local skill.', whenToUse: undefined,
    modelInvocable: true, userInvocable: true, source: 'project', provider: 'filesystem',
  },
]

/** The state every case starts from unless it says otherwise. */
function stateOf(overrides: Partial<SkillsSectionState> = {}): SkillsSectionState {
  return {
    status: 'ready',
    rows: ROWS,
    disabled: [],
    hiddenTags: [],
    pinnedTags: [],
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
    setSuggested: vi.fn(),
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

  it('offers the suggestion switch on every row and names the root each came from', () => {
    mount()

    fireEvent.click(disclosureOf('birdcoder-daily-dev'))

    expect(switchesOf('birdcoder-daily-dev')).toHaveLength(2)
    expect(screen.getByText('Routine changes.')).toBeTruthy()
    expect(within(rowOf('birdcoder-daily-dev')).getByText(en['row.field.invoke.model'])).toBeTruthy()
    expect(within(rowOf('birdcoder-daily-dev')).getByText(en['row.source.bundled'])).toBeTruthy()

    // The fact follows the catalog, not the group: a user-only skill says so.
    fireEvent.click(disclosureOf('birdcoder-tts'))
    expect(within(rowOf('birdcoder-tts')).getByText(en['row.field.invoke.user'])).toBeTruthy()

    // The unlisted project skill owns no scene-table seat, yet it still carries
    // the suggestion switch — that is the whole point of the pinned list.
    fireEvent.click(disclosureOf('team-notes'))
    expect(switchesOf('team-notes')).toHaveLength(2)
    expect(within(rowOf('team-notes')).getByText(en['row.source.project'])).toBeTruthy()
    expect(within(rowOf('team-notes')).getByText('filesystem')).toBeTruthy()
  })

  it('hints at the add direction for a skill no scene table places', () => {
    mount()

    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    expect(within(rowOf('birdcoder-daily-dev')).getByText(en['row.tagHint'])).toBeTruthy()

    fireEvent.click(disclosureOf('team-notes'))
    expect(within(rowOf('team-notes')).getByText(en['row.tagHint.extra'])).toBeTruthy()
  })

  it('derives the suggestion switch from both strip lists and forwards the scene default', () => {
    const { setSuggested } = mount({ hiddenTags: ['birdcoder-tts'], pinnedTags: ['team-notes'] })

    // A scene-table skill is on unless hidden; a pinned non-seat skill is on.
    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    expect(tagSwitchOf('birdcoder-daily-dev').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(disclosureOf('birdcoder-tts'))
    expect(tagSwitchOf('birdcoder-tts').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(disclosureOf('team-notes'))
    expect(tagSwitchOf('team-notes').getAttribute('aria-checked')).toBe('true')

    // Turning a scene-table skill off writes the hide direction; the writer is
    // told the name has a scene seat so it knows which field to touch.
    fireEvent.click(tagSwitchOf('birdcoder-daily-dev'))
    expect(setSuggested).toHaveBeenCalledWith('birdcoder-daily-dev', false, true)

    // Turning it back on clears the hide; turning a non-seat skill on pins it.
    fireEvent.click(tagSwitchOf('birdcoder-tts'))
    expect(setSuggested).toHaveBeenCalledWith('birdcoder-tts', true, true)
    fireEvent.click(tagSwitchOf('team-notes'))
    expect(setSuggested).toHaveBeenCalledWith('team-notes', false, false)
  })

  it('lets hidden win over pinned when the stored section contradicts itself', () => {
    mount({ hiddenTags: ['team-notes'], pinnedTags: ['team-notes'] })

    fireEvent.click(disclosureOf('team-notes'))

    expect(tagSwitchOf('team-notes').getAttribute('aria-checked')).toBe('false')
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

  it('filters by alias, description, and provider, and reports an empty match', () => {
    mount()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    expect(screen.getByText('/birdcoder-tts')).toBeTruthy()
    expect(screen.queryByText('/team-notes')).toBeNull()

    // The provider is searchable: a user hunting "which bundle is this from"
    // should not have to open every row to find out.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'filesystem' } })
    expect(screen.getByText('/team-notes')).toBeTruthy()
    expect(screen.queryByText('/birdcoder-tts')).toBeNull()

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

  it('says the rows are the whole-host inventory when no session is open', () => {
    mount({ status: 'global' })

    // The inventory is on screen — the page does not pretend it has nothing.
    expect(screen.getByText(en['state.global'])).toBeTruthy()
    expect(screen.getByText('/birdcoder-daily-dev')).toBeTruthy()
    // The global notice is not the cold-start one: 'idle' owns that state.
    expect(screen.queryByText(en['state.idle'])).toBeNull()
  })

  it('states the cold start before the first fetch settles', () => {
    mount({ status: 'idle', rows: [] })

    expect(screen.getByText(en['state.idle'])).toBeTruthy()
  })

  it('states the empty host, not a failed search, when even the global catalog is empty', () => {
    mount({ status: 'global', rows: [] })

    expect(screen.getByText(en['state.empty'])).toBeTruthy()
  })

  it('states the empty project when a session catalog resolves to nothing', () => {
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
