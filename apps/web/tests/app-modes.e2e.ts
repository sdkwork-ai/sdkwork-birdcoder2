// @vitest-environment jsdom
// Web assembled scenarios: the app-mode surface — the WeChat-desktop-style
// mode rail entries from ui-app-modes plus independent Knowledge Base, Assets,
// Token Plan, App Store, and SDKWork Agents generation packages; each
// non-code mode dispatches its keyed page.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
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
    'Code mode', 'Video generation mode', 'Image generation mode', 'App Store mode', 'Knowledge mode', 'Drive mode', 'Generated assets mode', 'Token Plan',
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
  fireEvent.click(entries[3]!)
  const appStorePage = await modePageOf('appstore')
  expect(frame.getAttribute('data-mode')).toBe('appstore')
  expect(within(appStorePage).getByRole('heading', { name: 'Discover apps' })).toBeTruthy()
  expect((await within(appStorePage).findByRole('alert')).textContent).toContain('The App Store could not be loaded. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  expect(entries[3]!.getAttribute('aria-pressed')).toBe('true')

  // Switching to Video dispatches the SDKWork Agents video generation page.
  // The anonymous assembled fixture has no access token, so the SDK rejects
  // the generation request before dispatch and the page settles into the
  // retry state.
  fireEvent.click(entries[1]!)
  const videoPage = await modePageOf('video')
  expect(frame.getAttribute('data-mode')).toBe('video')
  expect(within(videoPage).getByRole('heading', { name: 'Video generation' })).toBeTruthy()
  const videoPrompt = within(videoPage).getByRole('textbox', { name: 'Video prompt' }) as HTMLTextAreaElement
  fireEvent.change(videoPrompt, { target: { value: 'a robot dancing' } })
  fireEvent.click(within(videoPage).getByRole('button', { name: 'Generate' }))
  expect((await within(videoPage).findByRole('alert')).textContent)
    .toContain('The video could not be generated. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  expect(entries[1]!.getAttribute('aria-pressed')).toBe('true')

  // Switching to Image dispatches the embedded SDKWork Agents creative (生成) page.
  fireEvent.click(entries[2]!)
  const imagePage = await modePageOf('image')
  expect(frame.getAttribute('data-mode')).toBe('image')
  expect(imagePage.getAttribute('data-creative-surface')).toBe('sdkwork')
  await waitFor(() => {
    expect(within(imagePage).getByText('你好，想创作什么？')).toBeTruthy()
  }, { timeout: 10_000 })
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
    { id: 'image', label: 'Image generation mode' },
    { id: 'assets', label: 'Generated assets mode' },
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

  // The Assets entry opens the SDKWork Agents generated-assets library; the
  // anonymous fixture rejects the list request before dispatch. The loop
  // above already fired token-plan fetches, so the assertion below counts
  // only this section's traffic.
  vi.mocked(fetch).mockClear()
  fireEvent.click(entry('Generated assets mode'))
  const assetsPage = await modePageOf('assets')
  expect((await within(assetsPage).findByRole('alert')).textContent)
    .toContain('The assets could not be loaded. Try again later.')
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(entry('Code mode'))
  await waitFor(() => {
    expect(document.querySelector('[data-mode-page="assets"]')).toBeNull()
  })

  expect(document.querySelector('[data-conversation-scroll]')).not.toBeNull()
  fireEvent.click(entry('Knowledge mode'))
  const knowledgePage = await modePageOf('knowledge')
  expect(knowledgePage.getAttribute('data-knowledge-surface')).toBe('sdkwork')
  expect(document.querySelector('[data-conversation-scroll]')).toBeNull()

  fireEvent.click(entry('Courses mode'))
  const coursePage = await modePageOf('course')
  expect(coursePage.getAttribute('data-course-surface')).toBe('sdkwork')
  expect(coursePage.getAttribute('data-mode')).toBe('course')
  expect(document.querySelector('[data-mode-page="knowledge"]')).toBeNull()

  // Drive dispatches its own SDKWork surface below Course in the rail.
  fireEvent.click(entry('Drive mode'))
  const drivePage = await modePageOf('drive')
  expect(drivePage.getAttribute('data-drive-surface')).toBe('sdkwork')
  expect(drivePage.getAttribute('data-mode')).toBe('drive')
  expect(document.querySelector('[data-mode-page="knowledge"]')).toBeNull()
})

it('keeps the mode rail mounted while the sidebar is collapsed', async () => {
  mountAssembledApp()
  const rail = await railOf()
  expect(within(rail).getAllByRole('button')).toHaveLength(9)

  // Collapse the sidebar through its rail toggle; the mode rail stays.
  const collapse = await screen.findByRole('button', { name: 'Collapse sidebar' })
  act(() => { fireEvent.click(collapse) })
  const frame = document.querySelector('[data-mode]')!
  expect(frame.hasAttribute('data-sidebar-collapsed')).toBe(true)
  expect(screen.getByRole('group', { name: 'App modes' })).toBeTruthy()
})
