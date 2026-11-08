// @vitest-environment jsdom
/**
 * Skills settings page spec: the page renders the catalog the store carries as
 * one scenario tab at a time, puts everything unlisted in the fallback tab,
 * drives the enable switch through the injected callback, discloses the
 * per-row facts and the suggestion switch for *every* row (a project skill must
 * not be denied the affordance just because no scene table places it), filters
 * by name/description/provider/alias — including narrowing the tab strip to the
 * groups that still match — reports the root class each row came from, and
 * states the read-only, loading, global, error, cold-start and no-match
 * conditions instead of painting an empty catalog. The page-level strip switch
 * answers the separate question of whether the suggestion row exists at all,
 * and forwards its own write without touching the per-skill lists. The page
 * never writes the preference itself — every switch forwards to the injected
 * face.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SkillsSection, type SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { createSkillsSectionStore, type SkillCatalogRow, type SkillsSectionState } from '../src/client/skills-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Locale seat stand-in: the real English dictionary, so assertions read copy. */
const t = ((key: string) => (en as Record<string, string>)[key]) as SkillsSectionProps['t']

/**
 * Two built-ins of one group, one built-in of another, and one unlisted skill:
 * the batch actions need a tab with more than one row to mean anything, and the
 * three-group catalog is what proves a row-scoped or group-scoped query is
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
    showSceneTags: true,
    writable: true,
    pending: [],
    showSceneTagsPending: false,
    ...overrides,
  }
}

/** Build the store-backed props the renderer would compose. */
function mount(overrides: Partial<SkillsSectionState> = {}) {
  const store = createSnapshotStore<SkillsSectionState>(stateOf(overrides))
  const injected = {
    setEnabled: vi.fn(),
    setSuggested: vi.fn(),
    setShowSceneTags: vi.fn(),
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

/** The group tab whose label reads as the given text. */
function tabOf(label: string): HTMLElement {
  return screen.getByRole('tab', { name: label })
}

/** The panel rendered for the selected group. */
function panelOf(): HTMLElement {
  const panel = document.querySelector('[role="tabpanel"]')
  if (panel === null) throw new Error('group panel not rendered')
  return panel as HTMLElement
}

/** Select one group tab and return its panel. */
function openGroup(label: string): HTMLElement {
  fireEvent.click(tabOf(label))
  return panelOf()
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

/** The disclosure button inside one row, whichever state it is in. */
function disclosureOf(name: string): HTMLElement {
  const button = rowOf(name).querySelector('button[aria-expanded]')
  if (button === null) throw new Error(`disclosure not rendered: ${name}`)
  return button as HTMLElement
}

/** The page-level switch that decides whether the strip renders at all. */
function stripSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: en['strip.switch'] })
}

describe('SkillsSection', () => {
  it('renders one tab per non-empty group and shows only the selected group', () => {
    mount()

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      en['group.code'], en['group.media'], en['group.other'],
    ])
    // No document or market row in this catalog, so neither group takes a tab.
    expect(screen.queryByRole('tab', { name: en['group.document'] })).toBeNull()
    expect(screen.queryByRole('tab', { name: en['group.market'] })).toBeNull()
    // The first non-empty group is selected, and only its rows are on screen.
    expect(tabOf(en['group.code']).getAttribute('aria-selected')).toBe('true')
    expect(within(panelOf()).getByText('/birdcoder-daily-dev')).toBeTruthy()
    // The selected tab controls the rendered panel; the others have no panel
    // to point at, so they do not advertise a dangling reference.
    expect(tabOf(en['group.code']).getAttribute('aria-controls')).toBe(panelOf().id)
    expect(panelOf().getAttribute('aria-labelledby')).toBe(tabOf(en['group.code']).id)
    expect(tabOf(en['group.media']).getAttribute('aria-controls')).toBeNull()
    expect(screen.queryByText('/team-notes')).toBeNull()

    fireEvent.click(tabOf(en['group.other']))
    expect(tabOf(en['group.other']).getAttribute('aria-selected')).toBe('true')
    expect(within(panelOf()).getByText('/team-notes')).toBeTruthy()
    expect(screen.queryByText('/birdcoder-daily-dev')).toBeNull()
  })

  it('walks the group tabs with the keyboard and keeps focus on the selected tab', () => {
    mount()

    tabOf(en['group.code']).focus()
    // Arrows wrap in both directions, and Home/End jump to the ends.
    fireEvent.keyDown(tabOf(en['group.code']), { key: 'ArrowLeft' })
    expect(tabOf(en['group.other']).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabOf(en['group.other']))

    fireEvent.keyDown(tabOf(en['group.other']), { key: 'ArrowRight' })
    expect(tabOf(en['group.code']).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabOf(en['group.code']))

    fireEvent.keyDown(tabOf(en['group.code']), { key: 'ArrowRight' })
    expect(tabOf(en['group.media']).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabOf(en['group.media']))

    fireEvent.keyDown(tabOf(en['group.media']), { key: 'End' })
    expect(tabOf(en['group.other']).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tabOf(en['group.other']), { key: 'Home' })
    expect(tabOf(en['group.code']).getAttribute('aria-selected')).toBe('true')

    // Any other key stays out of the tablist's way.
    fireEvent.keyDown(tabOf(en['group.code']), { key: 'Tab' })
    expect(tabOf(en['group.code']).getAttribute('aria-selected')).toBe('true')
  })

  it('renders a single non-empty group without a tab strip', () => {
    mount({ rows: [ROWS[3]] })

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(document.querySelector('[role="tabpanel"]')).toBeNull()
    expect(screen.getByText('/team-notes')).toBeTruthy()
    expect(screen.getByText(`1 ${en['group.count']}`)).toBeTruthy()
  })

  it('lists a SkillHub market skill under the market tab and manages it like any other', () => {
    // The market registers its skills at runtime under provider `skill-market`
    // (the Host wire vocabulary reports the market's own source as `unknown`),
    // so the page must recognize the provider: the row leads the market tab,
    // names its real origin, and its enable switch writes the same durable
    // suppression every other skill uses — the host turns that into catalog
    // suppression, which is what makes Settings the management surface for
    // market-installed skills too.
    const marketRow: SkillCatalogRow = {
      name: 'market-pdf-skill', description: 'Installed from SkillHub.', whenToUse: undefined,
      modelInvocable: true, userInvocable: true, source: 'unknown', provider: 'skill-market',
    }
    const { setEnabled } = mount({ rows: [...ROWS, marketRow] })

    // Market rows lead the tabs, ahead of the packaged scene groups.
    expect(screen.getAllByRole('tab')[0]?.textContent).toBe(en['group.market'])

    openGroup(en['group.market'])
    expect(within(panelOf()).getByText('/market-pdf-skill')).toBeTruthy()

    fireEvent.click(disclosureOf('market-pdf-skill'))
    expect(within(rowOf('market-pdf-skill')).getByText(en['row.source.market'])).toBeTruthy()
    expect(within(rowOf('market-pdf-skill')).getByText('skill-market')).toBeTruthy()

    fireEvent.click(switchOf('market-pdf-skill'))
    expect(setEnabled).toHaveBeenCalledWith('market-pdf-skill', false)
  })

  it('keeps a suppressed market skill listable and re-enables it from the same row', () => {
    // Once suppressed, the catalog serves the manager's rank-0 placeholder for
    // that name instead of the market's registration: the row keeps the name
    // and renders from the suppression facts, so the switch is the way back.
    // Losing the market metadata here is why the row reads as the manager's
    // placeholder until it is re-enabled and the catalog refetched — recorded
    // as a known limitation rather than guessed around.
    const suppressedRow: SkillCatalogRow = {
      name: 'market-pdf-skill', description: 'Suppressed by the BirdCoder skill manager.', whenToUse: undefined,
      modelInvocable: false, userInvocable: false, source: 'runtime', provider: 'sdkwork-skill-suppression',
    }
    const { setEnabled } = mount({ rows: [...ROWS, suppressedRow], disabled: ['market-pdf-skill'] })

    // The market group is gone with the origin metadata; the placeholder lands
    // in the fallback tab until re-enabled.
    expect(screen.queryByRole('tab', { name: en['group.market'] })).toBeNull()
    openGroup(en['group.other'])
    expect(rowOf('market-pdf-skill')).toBeTruthy()
    expect(switchOf('market-pdf-skill').getAttribute('aria-checked')).toBe('false')

    fireEvent.click(switchOf('market-pdf-skill'))
    expect(setEnabled).toHaveBeenCalledWith('market-pdf-skill', true)
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

  it('turns the whole suggestion strip off from the page-level switch', () => {
    const { setShowSceneTags } = mount()

    expect(stripSwitch().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(stripSwitch())

    expect(setShowSceneTags).toHaveBeenCalledWith(false)
  })

  it('reflects a stored strip preference instead of the click', () => {
    mount({ showSceneTags: false })

    expect(stripSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('locks the page-level strip switch only while its own write is in flight', () => {
    mount({ showSceneTagsPending: true })
    expect(stripSwitch().hasAttribute('disabled')).toBe(true)

    cleanup()
    mount({ pending: ['birdcoder-daily-dev'] })
    expect(stripSwitch().hasAttribute('disabled')).toBe(false)
  })

  it('reflects a stored suppression instead of the click', () => {
    mount({ disabled: ['birdcoder-tts'] })

    openGroup(en['group.media'])
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

    // The disclosure closes again: the facts are reference material, not a
    // permanently expanded panel.
    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    expect(within(rowOf('birdcoder-daily-dev'))
      .getByRole('button', { name: en['row.expand'], hidden: true })).toBeTruthy()

    // The fact follows the catalog, not the group: a user-only skill says so.
    openGroup(en['group.media'])
    fireEvent.click(disclosureOf('birdcoder-tts'))
    expect(within(rowOf('birdcoder-tts')).getByText(en['row.field.invoke.user'])).toBeTruthy()

    // The unlisted project skill owns no scene-table seat, yet it still carries
    // the suggestion switch — that is the whole point of the pinned list.
    openGroup(en['group.other'])
    fireEvent.click(disclosureOf('team-notes'))
    expect(switchesOf('team-notes')).toHaveLength(2)
    expect(within(rowOf('team-notes')).getByText(en['row.source.project'])).toBeTruthy()
    expect(within(rowOf('team-notes')).getByText('filesystem')).toBeTruthy()
  })

  it('names every root class a catalog row can come from', () => {
    const roots: readonly SkillCatalogRow[] = [
      { name: 'custom-root', description: 'Preset.', whenToUse: undefined, modelInvocable: true, userInvocable: true, source: 'custom', provider: 'filesystem' },
      { name: 'user-root', description: 'User.', whenToUse: undefined, modelInvocable: true, userInvocable: true, source: 'user', provider: 'filesystem' },
      { name: 'runtime-root', description: 'Runtime.', whenToUse: undefined, modelInvocable: true, userInvocable: true, source: 'runtime', provider: 'filesystem' },
      { name: 'unknown-root', description: 'Unknown.', whenToUse: undefined, modelInvocable: true, userInvocable: true, source: 'unknown', provider: 'filesystem' },
    ]
    mount({ rows: roots })

    for (const [name, key] of [
      ['custom-root', 'row.source.custom'],
      ['user-root', 'row.source.user'],
      ['runtime-root', 'row.source.runtime'],
      ['unknown-root', 'row.source.unknown'],
    ] as const) {
      fireEvent.click(disclosureOf(name))
      expect(within(rowOf(name)).getByText(en[key])).toBeTruthy()
    }
  })

  it('hints at the add direction for a skill no scene table places', () => {
    mount()

    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    expect(within(rowOf('birdcoder-daily-dev')).getByText(en['row.tagHint'])).toBeTruthy()

    openGroup(en['group.other'])
    fireEvent.click(disclosureOf('team-notes'))
    expect(within(rowOf('team-notes')).getByText(en['row.tagHint.extra'])).toBeTruthy()
  })

  it('derives the suggestion switch from both strip lists and forwards the scene default', () => {
    const { setSuggested } = mount({ hiddenTags: ['birdcoder-tts'], pinnedTags: ['team-notes'] })

    // A scene-table skill is on unless hidden; a pinned non-seat skill is on.
    fireEvent.click(disclosureOf('birdcoder-daily-dev'))
    expect(tagSwitchOf('birdcoder-daily-dev').getAttribute('aria-checked')).toBe('true')

    openGroup(en['group.media'])
    fireEvent.click(disclosureOf('birdcoder-tts'))
    expect(tagSwitchOf('birdcoder-tts').getAttribute('aria-checked')).toBe('false')

    openGroup(en['group.other'])
    fireEvent.click(disclosureOf('team-notes'))
    expect(tagSwitchOf('team-notes').getAttribute('aria-checked')).toBe('true')

    // Turning a scene-table skill off writes the hide direction; the writer is
    // told the name has a scene seat so it knows which field to touch.
    openGroup(en['group.code'])
    fireEvent.click(tagSwitchOf('birdcoder-daily-dev'))
    expect(setSuggested).toHaveBeenCalledWith('birdcoder-daily-dev', false, true)

    // Turning it back on clears the hide; turning a non-seat skill on pins it.
    openGroup(en['group.media'])
    fireEvent.click(tagSwitchOf('birdcoder-tts'))
    expect(setSuggested).toHaveBeenCalledWith('birdcoder-tts', true, true)

    openGroup(en['group.other'])
    fireEvent.click(tagSwitchOf('team-notes'))
    expect(setSuggested).toHaveBeenCalledWith('team-notes', false, false)
  })

  it('lets hidden win over pinned when the stored section contradicts itself', () => {
    mount({ hiddenTags: ['team-notes'], pinnedTags: ['team-notes'] })

    openGroup(en['group.other'])
    fireEvent.click(disclosureOf('team-notes'))

    expect(tagSwitchOf('team-notes').getAttribute('aria-checked')).toBe('false')
  })

  it('enables and disables a whole group through the batch actions', () => {
    const { setEnabled } = mount()

    fireEvent.click(within(panelOf()).getByRole('button', { name: en['group.disableAll'] }))

    // Only the code group: the media and unlisted rows are untouched.
    expect(setEnabled).toHaveBeenCalledTimes(2)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-daily-dev', false)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-web-dev', false)
    expect(setEnabled).not.toHaveBeenCalledWith('birdcoder-tts', false)

    setEnabled.mockClear()
    fireEvent.click(within(panelOf()).getByRole('button', { name: en['group.enableAll'] }))
    expect(setEnabled).toHaveBeenCalledTimes(2)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-daily-dev', true)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-web-dev', true)
  })

  it('filters by alias, description, and provider, and narrows the tabs to the matches', () => {
    mount()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    // Only the media group still has a match, so its tab is the whole strip.
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([en['group.media']])
    expect(tabOf(en['group.media']).getAttribute('aria-selected')).toBe('true')
    expect(within(panelOf()).getByText('/birdcoder-tts')).toBeTruthy()
    expect(screen.queryByText('/team-notes')).toBeNull()

    // The provider is searchable: a user hunting "which bundle is this from"
    // should not have to open every row to find out.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'filesystem' } })
    expect(within(panelOf()).getByText('/team-notes')).toBeTruthy()
    expect(screen.queryByText('/birdcoder-tts')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-here' } })
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText(en['state.noMatch'])).toBeTruthy()
  })

  it('clears the query through the clear affordance and returns to the first group', () => {
    mount()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    fireEvent.click(screen.getByRole('button', { name: en['search.clear'] }))

    expect(tabOf(en['group.code']).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('/birdcoder-daily-dev')).toBeTruthy()
    expect(screen.queryByText('/birdcoder-tts')).toBeNull()
  })

  it('keeps the chosen tab across a search that changes which tabs exist', () => {
    mount()

    openGroup(en['group.media'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'speech' } })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: en['search.clear'] }))

    expect(tabOf(en['group.media']).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('/birdcoder-tts')).toBeTruthy()
  })

  it('locks the switches and says so on a read-only document', () => {
    mount({ writable: false })

    expect(screen.getByText(en['state.readOnly'])).toBeTruthy()
    expect(switchOf('birdcoder-daily-dev').hasAttribute('disabled')).toBe(true)
    expect(stripSwitch().hasAttribute('disabled')).toBe(true)
    const batch = within(panelOf()).getByRole('button', { name: en['group.disableAll'] })
    expect(batch.hasAttribute('disabled')).toBe(true)
  })

  it('skips a row whose write is already in flight in a batch action', () => {
    const { setEnabled } = mount({ pending: ['birdcoder-daily-dev'] })

    fireEvent.click(within(panelOf()).getByRole('button', { name: en['group.disableAll'] }))

    expect(setEnabled).toHaveBeenCalledTimes(1)
    expect(setEnabled).toHaveBeenCalledWith('birdcoder-web-dev', false)
  })

  it('disables only the row whose write is in flight', () => {
    mount({ pending: ['birdcoder-daily-dev'] })

    expect(switchOf('birdcoder-daily-dev').hasAttribute('disabled')).toBe(true)
    expect(switchOf('birdcoder-web-dev').hasAttribute('disabled')).toBe(false)
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

/**
 * The page's declared store: the write path marks the strip's own switch in
 * flight, and the preference projection is what the page renders instead of a
 * local copy of the click.
 */
describe('skills section store', () => {
  it('holds the strip master switch and its in-flight marker', () => {
    const store = createSkillsSectionStore().create()
    expect(store.getSnapshot().showSceneTags).toBe(true)
    expect(store.getSnapshot().showSceneTagsPending).toBe(false)

    store.actions.showSceneTagsPending(true)
    expect(store.getSnapshot().showSceneTagsPending).toBe(true)

    store.actions.preferences({
      disabled: [],
      hiddenTags: [],
      pinnedTags: [],
      showSceneTags: false,
      writable: true,
    })
    expect(store.getSnapshot().showSceneTags).toBe(false)
  })
})
