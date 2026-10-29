// @vitest-environment jsdom
// Web assembled scenarios: the app-mode surface — the WeChat-desktop-style
// mode rail entries from ui-sdkwork-app-modes plus independent Knowledge Base, Assets,
// Search, Token Plan, App Store, and SDKWork Agents generation packages; each
// non-code mode dispatches its keyed page. The shipped rail layout shows the
// five fixed modes (Code, Video, Image, Knowledge Base, Assets), App Store, and
// the pinned Token Plan; Search and the remaining user-owned entries start
// hidden and are enabled in the customize dialog, where the plus button opens it.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

installAssembledBootEnv()

/** The rail layout preference key: cleared per test so scenarios boot at the shipped layout. */
const RAIL_LAYOUT_KEY = 'dsh.railLayout'

beforeEach(() => {
  localStorage.removeItem(RAIL_LAYOUT_KEY)
})

/** The frame's rendered mode rail (the fixed leftmost track). */
async function railOf(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: 'App modes' }, { timeout: 10_000 })
}

/** Wait for one mode page to render. */
async function modePageOf(mode: string): Promise<HTMLElement> {
  await waitFor(() => {
    const page = document.querySelector(`[data-mode-page="${mode}"]`)
    if (page === null) throw new Error(`mode page '${mode}' not rendered`)
  }, { timeout: 10_000 })
  return document.querySelector(`[data-mode-page="${mode}"]`)!
}

/** Open the rail customize dialog and re-check the hidden modes by their row checkboxes. */
async function showRailModes(names: readonly string[]): Promise<void> {
  fireEvent.click(within(await railOf()).getByRole('button', { name: 'Customize icons' }))
  await screen.findByRole('dialog', { name: 'Customize the mode rail' })
  for (const name of names) {
    fireEvent.click(screen.getByRole('checkbox', { name }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
}

it('renders the shipped layout and dispatches feature-owned mode pages', async () => {
  mountAssembledApp()

  // The frame renders the mode rail beside the sidebar from the boot graph;
  // the shipped layout shows the fixed modes, the customize plus, and
  // the pinned Token Plan.
  const rail = await railOf()
  const entries = within(rail).getAllByRole('button')
  expect(entries.map(button => button.getAttribute('aria-label'))).toEqual([
    'Code mode', 'Video generation mode', 'Image generation mode', 'App Store mode', 'Knowledge mode', 'Assets mode', 'Customize icons', 'Token Plan',
  ])
  // Code is the boot mode: its entry carries the active highlight.
  expect(entries[0]!.getAttribute('aria-pressed')).toBe('true')
  expect(entries[1]!.getAttribute('aria-pressed')).toBe('false')

  // The sidebar settles beside the rail; the frame starts in code mode.
  await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.getAttribute('data-mode')).toBe('code')

  // Switching to App Store dispatches the feature-owned keyed page. App Store
  // ships visible in the layout, so the seat is already there. The anonymous
  // assembled fixture has no SDKWork access token, so the SDK rejects the
  // request before dispatch and the page settles into the retry state.
  const widened = entries
  fireEvent.click(widened[3]!)
  const appStorePage = await modePageOf('appstore')
  expect(frame.getAttribute('data-mode')).toBe('appstore')
  expect(within(appStorePage).getByRole('heading', { name: 'Discover apps' })).toBeTruthy()
  expect((await within(appStorePage).findByRole('alert')).textContent).toContain('The App Store could not be loaded. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  expect(widened[3]!.getAttribute('aria-pressed')).toBe('true')

  // Switching to Video dispatches the SDKWork Agents video generation page.
  // The anonymous assembled fixture has no access token, so the SDK rejects
  // the generation request before dispatch and the page settles into the
  // retry state.
  fireEvent.click(widened[1]!)
  const videoPage = await modePageOf('video')
  expect(frame.getAttribute('data-mode')).toBe('video')
  expect(within(videoPage).getByRole('heading', { name: 'Video generation' })).toBeTruthy()
  const videoPrompt = within(videoPage).getByRole('textbox', { name: 'Video prompt' }) as HTMLTextAreaElement
  fireEvent.change(videoPrompt, { target: { value: 'a robot dancing' } })
  fireEvent.click(within(videoPage).getByRole('button', { name: 'Generate' }))
  expect((await within(videoPage).findByRole('alert')).textContent)
    .toContain('The video could not be generated. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  expect(widened[1]!.getAttribute('aria-pressed')).toBe('true')

  // Switching to Image dispatches the embedded SDKWork Agents creative (生成) page.
  fireEvent.click(widened[2]!)
  const imagePage = await modePageOf('image')
  expect(frame.getAttribute('data-mode')).toBe('image')
  expect(imagePage.getAttribute('data-creative-surface')).toBe('sdkwork')
  await waitFor(() => {
    expect(within(imagePage).getByText('你好，想创作什么？')).toBeTruthy()
  }, { timeout: 10_000 })
  expect(widened[2]!.getAttribute('aria-pressed')).toBe('true')

  // The rail stays the recovery path: back to Code restores the workbench
  // (the placeholder page unmounts; the sidebar never left).
  fireEvent.click(widened[0]!)
  await waitFor(() => {
    expect(document.querySelector('[data-mode-page="video"]')).toBeNull()
  })
  expect(screen.queryByRole('tree', { name: 'Sessions' })).not.toBeNull()
  expect(frame.getAttribute('data-mode')).toBe('code')
  expect(widened[0]!.getAttribute('aria-pressed')).toBe('true')
})

it('enables Search from the customize dialog, then searches the catalog and opens a hit', async () => {
  // `ui-sdkwork-markets` injects the plugin-inventory and plugin-manager
  // Remotes this assembled fixture does not serve, so it never activates here;
  // excluding it keeps the boot assertion focused on the search surface.
  mountAssembledApp({ exclude: ['@deepseek-ai/dsh-client-ui-sdkwork-markets'] })
  const rail = await railOf()
  // Search ships hidden like every other user-owned entry: no seat in the
  // default layout, and the dialog's row starts unchecked and checkable.
  expect(within(rail).queryByRole('button', { name: 'Search mode' })).toBeNull()
  // App Store is the exception among the hideable modes: it ships visible and
  // its row starts checked.
  expect(within(rail).getByRole('button', { name: 'App Store mode' })).toBeTruthy()
  fireEvent.click(within(rail).getByRole('button', { name: 'Customize icons' }))
  const dialog = await screen.findByRole('dialog', { name: 'Customize the mode rail' })
  expect((within(dialog).getByRole('checkbox', { name: 'Show App Store' }) as HTMLInputElement).checked).toBe(true)
  const searchCheck = within(dialog).getByRole('checkbox', { name: 'Show Search' }) as HTMLInputElement
  expect(searchCheck.disabled).toBe(false)
  expect(searchCheck.checked).toBe(false)

  // Checking it adds the seat live, below Assets and directly above the plus;
  // unchecking it removes the seat again.
  fireEvent.click(searchCheck)
  const labels = within(rail).getAllByRole('button').map(button => button.getAttribute('aria-label'))
  expect(labels.indexOf('Search mode')).toBe(labels.indexOf('Assets mode') + 1)
  expect(labels[labels.indexOf('Search mode') + 1]).toBe('Customize icons')
  fireEvent.click(searchCheck)
  expect(within(rail).queryByRole('button', { name: 'Search mode' })).toBeNull()
  fireEvent.click(searchCheck)

  // Reorder inside the open dialog: pressing the Assets row and dropping it
  // above Video generation commits one layout write, and the rail behind the
  // dialog follows it. jsdom has no layout, so the rows' boxes are stubbed —
  // the drag math, the gesture plumbing, and the store/rail wiring are real.
  const dialogRows = [...dialog.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
  dialogRows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({
      x: 0, y: index * 100, top: index * 100, left: 0, right: 40, bottom: index * 100 + 40,
      width: 40, height: 40, toJSON: () => ({}),
    })
  })
  const assetsRow = dialogRows.find(row => row.textContent === 'Assets')!
  const videoRow = dialogRows.find(row => row.textContent === 'Video generation')!
  // The list's box covers the whole stack, so the pointer never enters the
  // edge bands that auto-scroll during a drag.
  dialogRows[0]!.parentElement!.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 560, bottom: dialogRows.length * 100,
    width: 560, height: dialogRows.length * 100, toJSON: () => ({}),
  })
  // Press at the Assets row's midpoint, drop just above Video generation's.
  fireEvent.pointerDown(assetsRow, { pointerId: 1, button: 0, clientY: 920 })
  fireEvent.pointerMove(assetsRow, { pointerId: 1, clientY: 305 })
  expect(assetsRow.getAttribute('data-dragging')).toBe('')
  expect(document.body.querySelector('[data-drop-before]')).toBe(videoRow)
  fireEvent.pointerUp(assetsRow, { pointerId: 1, clientY: 305 })
  const reordered = within(rail).getAllByRole('button').map(button => button.getAttribute('aria-label'))
  expect(reordered.slice(0, 4)).toEqual(['Code mode', 'Assets mode', 'Video generation mode', 'Image generation mode'])
  const committedRows = [...dialog.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
    .map(row => row.textContent)
  expect(committedRows.indexOf('Assets')).toBe(committedRows.indexOf('Video generation') - 1)

  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
  expect(within(rail).getByRole('button', { name: 'Search mode' })).toBeTruthy()

  // The enabled seat opens the search page.
  fireEvent.click(within(rail).getByRole('button', { name: 'Search mode' }))
  const page = await modePageOf('search')
  expect(page.getAttribute('data-search-surface')).toBe('sdkwork')
  // The anonymous fixture carries no credentials, so the query is answered by
  // the local catalog.
  const query = within(page).getByRole('searchbox')
  fireEvent.change(query, { target: { value: 'drive' } })
  fireEvent.click(within(page).getByRole('button', { name: 'Search' }))
  const hit = await within(page).findByRole('button', { name: /Drive/ })
  // The hit comes from the local capability catalog, not the SDKWork index.
  expect(within(hit).getByText('Local')).toBeTruthy()

  // A local hit navigates to the mode page its catalog document names, even
  // while that mode's rail entry is hidden in the shipped layout.
  fireEvent.click(hit)
  const drivePage = await modePageOf('drive')
  expect(drivePage.getAttribute('data-drive-surface')).toBe('sdkwork')
  expect(document.querySelector('[data-mode]')!.getAttribute('data-mode')).toBe('drive')
  expect(document.querySelector('[data-mode-page="search"]')).toBeNull()
})

it('places the IM modes directly below Code and dispatches their signed-out pages', async () => {
  // `ui-sdkwork-markets` fails to activate in this composition independently of
  // the IM modes (it is not part of this scenario); excluding it keeps the boot
  // assertion focused on the rail order and the two IM pages.
  mountAssembledApp({ exclude: ['@deepseek-ai/dsh-client-ui-sdkwork-markets'] })
  // Chat and Contacts sit outside the shipped layout: enable them through
  // the dialog so both IM modes sit directly below Code, ahead of the content
  // modes.
  await showRailModes(['Show Chat', 'Show Contacts'])
  const rail = await railOf()
  const entries = within(rail).getAllByRole('button')
  expect(entries.slice(0, 3).map(button => button.getAttribute('aria-label')))
    .toEqual(['Code mode', 'Chat mode', 'Contacts mode'])

  fireEvent.click(entries[1]!)
  const chatPage = await modePageOf('chat')
  const frame = document.querySelector('[data-mode]')!
  expect(frame.getAttribute('data-mode')).toBe('chat')
  // The anonymous fixture is signed out: the IAM gate replaces the IM surfaces
  // with the sign-in notice, so the mount container never appears.
  expect(within(chatPage).getByText('Sign in to chat')).toBeTruthy()
  expect(document.querySelector('[data-im-conversation-list]')).toBeNull()

  fireEvent.click(entries[2]!)
  const contactsPage = await modePageOf('contacts')
  expect(frame.getAttribute('data-mode')).toBe('contacts')
  expect(within(contactsPage).getByText('Sign in to use Contacts')).toBeTruthy()
  expect(document.querySelector('[data-im-contacts]')).toBeNull()

  fireEvent.click(entries[0]!)
  await waitFor(() => {
    expect(document.querySelector('[data-mode-page="chat"]')).toBeNull()
    expect(document.querySelector('[data-mode-page="contacts"]')).toBeNull()
  })
})

it('switches between base placeholders and the SDKWork Knowledge Base surface', async () => {
  mountAssembledApp()
  // The content modes this scenario drives (course, drive) are hidden in the
  // shipped layout: enable them through the customize dialog. Assets and
  // Knowledge Base are fixed modes and already show.
  await showRailModes(['Show Courses', 'Show Drive'])
  const entry = async (name: string): Promise<HTMLButtonElement> =>
    within(await railOf()).getByRole('button', { name }) as HTMLButtonElement

  for (const mode of [
    { id: 'image', label: 'Image generation mode' },
    { id: 'assets', label: 'Assets mode' },
    { id: 'token-plan', label: 'Token Plan' },
  ] as const) {
    fireEvent.click(await entry(mode.label))
    const page = await modePageOf(mode.id)
    expect(page.getAttribute('data-mode')).toBe(mode.id)
    fireEvent.click(await entry('Code mode'))
    await waitFor(() => {
      expect(document.querySelector(`[data-mode-page="${mode.id}"]`)).toBeNull()
    })
  }

  // The Assets entry opens the SDKWork Agents generated-assets library; the
  // anonymous fixture rejects the list request before dispatch. The loop
  // above already fired token-plan fetches, so the assertion below counts
  // only this section's traffic.
  vi.mocked(fetch).mockClear()
  fireEvent.click(await entry('Assets mode'))
  const assetsPage = await modePageOf('assets')
  expect((await within(assetsPage).findByRole('alert')).textContent)
    .toContain('The assets could not be loaded. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(await entry('Code mode'))
  await waitFor(() => {
    expect(document.querySelector('[data-mode-page="assets"]')).toBeNull()
  })

  expect(document.querySelector('[data-conversation-scroll]')).not.toBeNull()
  fireEvent.click(await entry('Knowledge mode'))
  const knowledgePage = await modePageOf('knowledge')
  expect(knowledgePage.getAttribute('data-knowledge-surface')).toBe('sdkwork')
  expect(document.querySelector('[data-conversation-scroll]')).toBeNull()

  fireEvent.click(await entry('Courses mode'))
  const coursePage = await modePageOf('course')
  expect(coursePage.getAttribute('data-course-surface')).toBe('sdkwork')
  expect(coursePage.getAttribute('data-mode')).toBe('course')
  expect(document.querySelector('[data-mode-page="knowledge"]')).toBeNull()

  // Drive dispatches its own SDKWork surface below Course in the rail.
  fireEvent.click(await entry('Drive mode'))
  const drivePage = await modePageOf('drive')
  expect(drivePage.getAttribute('data-drive-surface')).toBe('sdkwork')
  expect(drivePage.getAttribute('data-mode')).toBe('drive')
  expect(document.querySelector('[data-mode-page="knowledge"]')).toBeNull()
})

it('customizes the rail through the plus dialog and resets to the shipped layout', async () => {
  mountAssembledApp()
  const rail = await railOf()
  fireEvent.click(within(rail).getByRole('button', { name: 'Customize icons' }))
  const dialog = await screen.findByRole('dialog', { name: 'Customize the mode rail' })
  // One row per registered mode entry (the pinned Token Plan is not offered).
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(11)

  // A fixed mode's checkbox renders disabled: the rail keeps the seat.
  expect((within(dialog).getByRole('checkbox', { name: 'Show Video generation' }) as HTMLInputElement).disabled).toBe(true)

  // Checking a hidden, hideable row adds its seat live, behind the open dialog.
  const contactsCheck = within(dialog).getByRole('checkbox', { name: 'Show Contacts' })
  fireEvent.click(contactsCheck)
  expect(within(rail).getByRole('button', { name: 'Contacts mode' })).toBeTruthy()
  // Unchecking it removes the seat again.
  fireEvent.click(contactsCheck)
  expect(within(rail).queryByRole('button', { name: 'Contacts mode' })).toBeNull()

  // Reset restores the shipped layout; Done closes.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to default' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
  // The assembled fixture keeps its own Preview Notice dialog open; only this
  // dialog must be gone.
  expect(screen.queryByRole('dialog', { name: 'Customize the mode rail' })).toBeNull()
})

it('keeps the mode rail mounted while the sidebar is collapsed', async () => {
  mountAssembledApp()
  const rail = await railOf()
  // The shipped layout: six entries, the customize plus, the pinned Token Plan.
  expect(within(rail).getAllByRole('button')).toHaveLength(8)

  // Collapse the sidebar through its rail toggle; the mode rail stays.
  const collapse = await screen.findByRole('button', { name: 'Collapse sidebar' })
  act(() => { fireEvent.click(collapse) })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  expect(screen.getByRole('group', { name: 'App modes' })).toBeTruthy()
})
