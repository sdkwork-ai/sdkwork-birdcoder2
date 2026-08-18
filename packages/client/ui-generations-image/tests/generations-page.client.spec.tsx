// @vitest-environment jsdom
/** Image generation page: the image input composer drives generation and renders every request state. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { ImageGenerationsPage, type ImageGenerationsPageProps } from '../src/client/GenerationsPage.tsx'
import type { ImageGenerationSnapshot } from '../src/client/generations-service.ts'

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {},
    jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

const t = ((key: string) => key) as ImageGenerationsPageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }
function observable(snapshot: ImageGenerationSnapshot) {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}
const idle = (): ImageGenerationSnapshot => ({ status: 'idle', prompt: '', results: [] })

afterEach(cleanup)

describe('ImageGenerationsPage', () => {
  it('marks the image page and renders the image generation input', () => {
    const { container, getByRole } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={vi.fn()}
        useGeneration={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const page = container.querySelector('[data-mode-page="image"]')!
    expect(page.getAttribute('data-mode')).toBe('image')
    expect(within(page).getByRole('heading', { name: 'page.title' })).toBeTruthy()
    expect(getByRole('textbox', { name: 'page.prompt' })).toBeTruthy()
    // An empty draft cannot submit: the composer is the image input.
    expect(getByRole('button', { name: 'page.generate' }).hasAttribute('disabled')).toBe(true)
  })

  it('submits the trimmed draft to the generation callback', () => {
    const generate = vi.fn()
    const { getByRole } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const prompt = getByRole('textbox', { name: 'page.prompt' }) as HTMLTextAreaElement
    fireEvent.change(prompt, { target: { value: '  a red panda  ' } })
    fireEvent.submit(getByRole('form', { name: 'page.input' }))
    expect(generate).toHaveBeenCalledWith('a red panda')
  })

  it('does not submit an empty or whitespace-only draft', () => {
    const generate = vi.fn()
    const { getByRole } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const prompt = getByRole('textbox', { name: 'page.prompt' }) as HTMLTextAreaElement
    fireEvent.change(prompt, { target: { value: '   ' } })
    fireEvent.submit(getByRole('form', { name: 'page.input' }))
    expect(generate).not.toHaveBeenCalled()
  })

  it('shows the configuration state without submitting', () => {
    const generate = vi.fn()
    const { getByRole, getByText } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'unconfigured', prompt: '', results: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.configure')
    expect(getByText('page.configure')).toBeTruthy()
  })

  it('shows the generating state and disables resubmission', () => {
    const generate = vi.fn()
    const { getByRole, getByText } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'generating', prompt: 'a panda', results: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.generating')
    expect(getByText('page.generating')).toBeTruthy()
    expect(getByRole('button', { name: 'page.generate' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the error state and retries the committed prompt', () => {
    const generate = vi.fn()
    const { getByRole } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'error', prompt: 'a panda', results: [] }))}
        t={t}
      />,
    )
    expect(getByRole('alert').textContent).toContain('page.error')
    fireEvent.click(getByRole('button', { name: 'page.retry' }))
    expect(generate).toHaveBeenCalledWith('a panda')
  })

  it('renders the generated image grid and syncs the draft from committed prompts', async () => {
    const generate = vi.fn()
    const ready: ImageGenerationSnapshot = {
      status: 'ready',
      prompt: 'a panda',
      results: [{ url: 'https://assets.sdkwork.com/a.png' }, { url: 'https://assets.sdkwork.com/b.png' }],
    }
    const { getByRole, container } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable(ready))}
        t={t}
      />,
    )
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute('src')).toBe('https://assets.sdkwork.com/a.png')
    expect(images[0].getAttribute('alt')).toBe('page.result 1')
    // The committed prompt restores the draft after a generation round.
    await waitFor(() => {
      expect((getByRole('textbox', { name: 'page.prompt' }) as HTMLTextAreaElement).value).toBe('a panda')
    })
  })

  it('shows the empty results notice for a ready request without images', () => {
    const { getByText } = render(
      <ImageGenerationsPage
        {...standard}
        mode="image"
        generate={vi.fn()}
        useGeneration={bindSnapshotSelector(observable({ status: 'ready', prompt: 'a panda', results: [] }))}
        t={t}
      />,
    )
    expect(getByText('page.empty')).toBeTruthy()
  })
})
