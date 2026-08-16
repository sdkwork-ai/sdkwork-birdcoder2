// @vitest-environment jsdom
// Web assembled scenarios: the app-mode surface — the WeChat-desktop-style
// mode rail in the frame's leftmost track, and the placeholder-page switching
// for the non-code modes. The rail assembles one keyed entry per mode module
// (the base five from ui-app-modes, Knowledge Base and Assets from their own
// packages); switching to a non-code mode unmounts the conversation surface
// and renders the keyed placeholder page, and switching back to Code restores
// it. Keyless: the fixture transport serves no settings document, so the
// sidebar-visibility preference row stays hidden in this lane (its behavior
// is pinned by the plugin's unit specs).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

installAssembledBootEnv()

/** The frame's rendered mode rail (the fixed leftmost track). */
async function railOf(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: 'App modes' }, { timeout: 10_000 })
}

/** Wait for the placeholder page of one mode to render. */
async function modePageOf(mode: string): Promise<HTMLElement> {
  await waitFor(() => {
    const page = document.querySelector(`[data-mode-page="${mode}"]`)
    if (page === null) throw new Error(`mode page '${mode}' not rendered`)
  }, { timeout: 10_000 })
  return document.querySelector(`[data-mode-page="${mode}"]`)!
}

it('renders the mode rail with every module entry and switches placeholder pages per mode', async () => {
  mountAssembledApp()

  // The frame renders the mode rail beside the sidebar from the boot graph;
  // every mode module contributed its entry.
  const rail = await railOf()
  const entries = within(rail).getAllByRole('button')
  expect(entries.map(button => button.getAttribute('aria-label'))).toEqual([
    'Code mode', 'Work mode', 'Video mode', 'Image mode', 'App Store mode', 'Knowledge mode', 'Assets mode',
  ])
  // Code is the boot mode: its entry carries the active highlight.
  expect(entries[0]!.getAttribute('aria-pressed')).toBe('true')
  expect(entries[1]!.getAttribute('aria-pressed')).toBe('false')

  // The sidebar settles beside the rail; the frame starts in code mode.
  await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.getAttribute('data-mode')).toBe('code')

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

it('each non-code mode switches to its own placeholder page', async () => {
  mountAssembledApp()
  const rail = await railOf()
  const entries = within(rail).getAllByRole('button')

  // Rail order: code(0), work(1), video(2), image(3), appstore(4),
  // knowledge(5), assets(6).
  for (const [mode, index] of [['work', 1], ['image', 3], ['appstore', 4], ['knowledge', 5], ['assets', 6]] as const) {
    fireEvent.click(entries[index]!)
    const page = await modePageOf(mode)
    expect(page.getAttribute('data-mode')).toBe(mode)
    // Returning to Code resets the frame for the next entry.
    fireEvent.click(entries[0]!)
    await waitFor(() => {
      expect(document.querySelector(`[data-mode-page="${mode}"]`)).toBeNull()
    })
  }
})

it('keeps the mode rail mounted while the sidebar is collapsed', async () => {
  mountAssembledApp()
  const rail = await railOf()
  expect(within(rail).getAllByRole('button')).toHaveLength(7)

  // Collapse the sidebar through its rail toggle; the mode rail stays.
  const collapse = await screen.findByRole('button', { name: 'Collapse sidebar' })
  act(() => { fireEvent.click(collapse) })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  expect(screen.getByRole('group', { name: 'App modes' })).toBeTruthy()
})
