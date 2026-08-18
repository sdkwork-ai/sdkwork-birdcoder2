// @vitest-environment jsdom
/** Video generation page: the video input composer drives generation and renders every request state. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { VideoGenerationsPage, type VideoGenerationsPageProps } from '../src/client/GenerationsPage.tsx'
import type { VideoGenerationSnapshot } from '../src/client/generations-service.ts'

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

const t = ((key: string) => key) as VideoGenerationsPageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }
function observable(snapshot: VideoGenerationSnapshot) {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}
const idle = (): VideoGenerationSnapshot => ({ status: 'idle', prompt: '', results: [] })

afterEach(cleanup)

describe('VideoGenerationsPage', () => {
  it('marks the video page and renders the video generation input', () => {
    const { container, getByRole } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={vi.fn()}
        useGeneration={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const page = container.querySelector('[data-mode-page="video"]')!
    expect(page.getAttribute('data-mode')).toBe('video')
    expect(within(page).getByRole('heading', { name: 'page.title' })).toBeTruthy()
    expect(getByRole('textbox', { name: 'page.prompt' })).toBeTruthy()
    // An empty draft cannot submit: the composer is the video input.
    expect(getByRole('button', { name: 'page.generate' }).hasAttribute('disabled')).toBe(true)
  })

  it('submits the trimmed draft to the generation callback', () => {
    const generate = vi.fn()
    const { getByRole } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const prompt = getByRole('textbox', { name: 'page.prompt' }) as HTMLTextAreaElement
    fireEvent.change(prompt, { target: { value: '  a robot dancing  ' } })
    fireEvent.submit(getByRole('form', { name: 'page.input' }))
    expect(generate).toHaveBeenCalledWith('a robot dancing')
  })

  it('does not submit an empty or whitespace-only draft', () => {
    const generate = vi.fn()
    const { getByRole } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
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
    const { getByRole } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'unconfigured', prompt: '', results: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.configure')
  })

  it('shows the generating state and disables resubmission', () => {
    const generate = vi.fn()
    const { getByRole, getByText } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'generating', prompt: 'a robot', results: [] }))}
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
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable({ status: 'error', prompt: 'a robot', results: [] }))}
        t={t}
      />,
    )
    expect(getByRole('alert').textContent).toContain('page.error')
    fireEvent.click(getByRole('button', { name: 'page.retry' }))
    expect(generate).toHaveBeenCalledWith('a robot')
  })

  it('renders the generated video player and syncs the draft from committed prompts', async () => {
    const generate = vi.fn()
    const ready: VideoGenerationSnapshot = {
      status: 'ready',
      prompt: 'a robot',
      results: [{ url: 'https://assets.sdkwork.com/robot.mp4' }],
    }
    const { getByRole, container } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={generate}
        useGeneration={bindSnapshotSelector(observable(ready))}
        t={t}
      />,
    )
    const video = container.querySelector('video')!
    expect(video.getAttribute('src')).toBe('https://assets.sdkwork.com/robot.mp4')
    expect(video.hasAttribute('controls')).toBe(true)
    // The committed prompt restores the draft after a generation round.
    await waitFor(() => {
      expect((getByRole('textbox', { name: 'page.prompt' }) as HTMLTextAreaElement).value).toBe('a robot')
    })
  })

  it('shows the empty results notice for a ready request without videos', () => {
    const { getByText } = render(
      <VideoGenerationsPage
        {...standard}
        mode="video"
        generate={vi.fn()}
        useGeneration={bindSnapshotSelector(observable({ status: 'ready', prompt: 'a robot', results: [] }))}
        t={t}
      />,
    )
    expect(getByText('page.empty')).toBeTruthy()
  })
})
