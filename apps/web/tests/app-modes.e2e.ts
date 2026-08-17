// @vitest-environment jsdom
// Web assembled scenarios: the app-mode surface — the WeChat-desktop-style
// mode rail entries from ui-app-modes plus independent Knowledge Base, Assets,
// Token Plan, and App Store packages; each non-code mode dispatches its keyed page.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

installAssembledBootEnv()

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

it('renders every module entry and dispatches feature-owned mode pages', async () => {
  mountAssembledApp()

  // The frame renders the mode rail beside the sidebar from the boot graph;
  // every mode module contributed its entry.
  const rail = await railOf()
  const entries = within(rail).getAllByRole('button')
  expect(entries.map(button => button.getAttribute('aria-label'))).toEqual([
    'Code mode', 'Work mode', 'Video mode', 'Image mode', 'App Store mode', 'Knowledge mode', 'Assets mode', 'Token Plan',
  ])
  // Code is the boot mode: its entry carries the active highlight.
  expect(entries[0]!.getAttribute('aria-pressed')).toBe('true')
  expect(entries[1]!.getAttribute('aria-pressed')).toBe('false')

  // The sidebar settles beside the rail; the frame starts in code mode.
  await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.getAttribute('data-mode')).toBe('code')

  // Switching to App Store dispatches the feature-owned keyed page. The
  // anonymous assembled fixture has no SDKWork access token, so the SDK rejects
  // the request before dispatch and the page settles into the retry state.
  fireEvent.click(entries[4]!)
  const appStorePage = await modePageOf('appstore')
  expect(frame.getAttribute('data-mode')).toBe('appstore')
  expect(within(appStorePage).getByRole('heading', { name: 'App Store' })).toBeTruthy()
  expect((await within(appStorePage).findByRole('alert')).textContent).toContain('The App Store could not be loaded. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  expect(entries[4]!.getAttribute('aria-pressed')).toBe('true')

  // Switching to Video renders the placeholder page in the center column.
  fireEvent.click(entries[2]!)
  const page = await modePageOf('video')
  expect(frame.getAttribute('data-mode')).toBe('video')
  expect(within(page).getByText('Video')).toBeTruthy()
  expect(within(page).getByText('This page is under construction.')).toBeTruthy()
  expect(entries[2]!.getAttribute('aria-pressed')).toBe('true')

  // The rail stays the recovery path: back to Code restores the workbench
  // (the placeholder page unmounts; the sidebar never left).
  fireEvent.click(entries[0]!)
  await waitFor(() => {
    expect(document.querySelector('[data-mode-page="video"]')).toBeNull()
  })
  expect(screen.queryByRole('tree', { name: 'Sessions' })).not.toBeNull()
  expect(frame.getAttribute('data-mode')).toBe('code')
  expect(entries[0]!.getAttribute('aria-pressed')).toBe('true')
})

it('switches between base placeholders and the SDKWork Knowledge Base surface', async () => {
  mountAssembledApp()
  const rail = await railOf()
  const entry = (name: string): HTMLButtonElement =>
    within(rail).getByRole('button', { name }) as HTMLButtonElement

  for (const mode of [
    { id: 'work', label: 'Work mode' },
    { id: 'image', label: 'Image mode' },
    { id: 'assets', label: 'Assets mode' },
    { id: 'token-plan', label: 'Token Plan' },
  ] as const) {
    fireEvent.click(entry(mode.label))
    const page = await modePageOf(mode.id)
    expect(page.getAttribute('data-mode')).toBe(mode.id)
    fireEvent.click(entry('Code mode'))
    await waitFor(() => {
      expect(document.querySelector(`[data-mode-page="${mode.id}"]`)).toBeNull()
    })
  }

  expect(document.querySelector('[data-conversation-scroll]')).not.toBeNull()
  fireEvent.click(entry('Knowledge mode'))
  const knowledgePage = await modePageOf('knowledge')
  expect(knowledgePage.getAttribute('data-knowledge-surface')).toBe('sdkwork')
  expect(document.querySelector('[data-conversation-scroll]')).toBeNull()
})

it('keeps the mode rail mounted while the sidebar is collapsed', async () => {
  mountAssembledApp()
  const rail = await railOf()
  expect(within(rail).getAllByRole('button')).toHaveLength(8)

  // Collapse the sidebar through its rail toggle; the mode rail stays.
  const collapse = await screen.findByRole('button', { name: 'Collapse sidebar' })
  act(() => { fireEvent.click(collapse) })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  expect(screen.getByRole('group', { name: 'App modes' })).toBeTruthy()
})
