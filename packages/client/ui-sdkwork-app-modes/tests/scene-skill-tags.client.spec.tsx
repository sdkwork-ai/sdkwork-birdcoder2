// @vitest-environment jsdom
/**
 * Scene skill tags spec: the composer-dock strip below the input card lists
 * the staged scene's skills fully expanded (no overflow chrome — the row
 * wraps), follows the staged scene, and writes the same `/name ` literal a
 * '/'-menu pick lands through the public draft write in replace mode (one
 * BirdCoder skill per draft).
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { EMPTY_CONVERSATION_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore as createRuntimeSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { SceneSkillTags, type SceneSkillTagsProps } from '../src/client/SceneSkillTags.tsx'
import { createHeroSceneStore } from '../src/client/hero-scene-store.ts'
import { SCENE_SKILLS } from '../src/client/scene-skills.ts'

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as SceneSkillTagsProps['t']

/** Minimal input state fixture: the strip reads only the draft text. */
function inputOf(draft: string): InputState {
  return { draft, attachmentIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [] } as InputState
}

/** Empty session-standard kit; the session fixture defaults to blank (the
 * phase the strip serves) and can be overridden to a live conversation. */
function emptyKit(sessionOverrides: Partial<SessionSnapshot> = {}) {
  const session = { ...sessionSnapshot('s1' as never), blank: true, awaitingFirstTurn: true, ...sessionOverrides }
  const emptyList = { ids: [], byId: {}, current: undefined, phase: 'ready' as const, subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }
  const sessions = bindSnapshotSelector(createRuntimeSnapshotStore<SessionListState>(emptyList))
  const workspaces = bindSnapshotSelector(createRuntimeSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
  return {
    sessionId: 's1' as never,
    useSession: bindSnapshotSelector(createSnapshotStore(session)),
    useProjection: (() => undefined) as never,
    useConversation: bindSnapshotSelector(createSnapshotStore(EMPTY_CONVERSATION_SNAPSHOT)),
    useChat: (() => undefined) as never,
    useTrajectory: (() => undefined) as never,
    useSessions: sessions,
    useWorkspaces: workspaces,
    useSessionPendingInteraction: bindSnapshotSelector(createSnapshotStore(new Map<never, never>())),
  }
}

/** The public input actions wired to a live input store (a draft write is
 * visible to the next read), with a recording draft write. */
function actionsOf(store: SnapshotStore<InputState>) {
  return {
    setDraft: vi.fn((text: string) => { store.set(inputOf(text)) }),
    addAttachments: vi.fn(() => true),
    removeAttachment: vi.fn(),
    pruneAttachments: vi.fn(),
    submit: vi.fn(),
  }
}

function mount(options: { draft?: string; session?: Partial<SessionSnapshot> } = {}) {
  const inputStore = createSnapshotStore(inputOf(options.draft ?? ''))
  const actions = actionsOf(inputStore)
  const scene = createHeroSceneStore()
  const view = render(
    <SceneSkillTags
      {...emptyKit(options.session)}
      useInput={bindSnapshotSelector(inputStore)}
      inputActions={actions}
      scene={scene}
      t={t}
    />,
  )
  return { view, scene, actions }
}

describe('SceneSkillTags', () => {
  it('lists the staged scene’s skills fully expanded, every tag a token', () => {
    const { view } = mount()
    const strip = view.container.querySelector('[data-scene-skills="code"]')!
    const tags = [...strip.querySelectorAll('button')]
    expect(tags).toHaveLength(SCENE_SKILLS.code.length)
    expect(tags[0]!.getAttribute('title')).toBe('/birdcoder-daily-dev')
    expect(tags.map(tag => tag.textContent)).toEqual([
      'heroTag.dailyDev', 'heroTag.webDev', 'heroTag.htmlWeb', 'heroTag.reactWeb',
      'heroTag.vueWeb', 'heroTag.agentApp',
      'heroTag.skillDev', 'heroTag.cicd', 'heroTag.docs',
      'heroTag.miniprogram', 'heroTag.flutterApp', 'heroTag.uniapp',
      'heroTag.harmonyos', 'heroTag.iosApp', 'heroTag.androidApp', 'heroTag.unityApp',
      'heroTag.dshPlugin', 'heroTag.workbuddyPlugin', 'heroTag.codexPlugin', 'heroTag.workbuddyApp',
    ])
    // No overflow chrome: every tag is a sibling (a wrapped row, not a clip).
    expect(strip.querySelector('[data-scene-more]')).toBeNull()
  })

  it('a tag click writes the /name literal through the public draft write', () => {
    const { view, actions } = mount()
    fireEvent.click(view.container.querySelector('[title="/birdcoder-web-dev"]')!)
    expect(actions.setDraft).toHaveBeenCalledWith('/birdcoder-web-dev ')
    expect(actions.submit).not.toHaveBeenCalled()
  })

  it('consecutive tag picks replace the previous skill instead of accumulating', () => {
    const { view, actions } = mount()
    const tag = (skill: string) => view.container.querySelector(`[title="/${skill}"]`)!
    fireEvent.click(tag('birdcoder-web-dev'))
    expect(actions.setDraft).toHaveBeenLastCalledWith('/birdcoder-web-dev ')
    fireEvent.click(tag('birdcoder-skill-dev'))
    expect(actions.setDraft).toHaveBeenLastCalledWith('/birdcoder-skill-dev ')
  })

  it('a non-empty draft gets a single-space glue before the token', () => {
    const { view, actions } = mount({ draft: '帮我做一个' })
    fireEvent.click(view.container.querySelector('[title="/birdcoder-daily-dev"]')!)
    expect(actions.setDraft).toHaveBeenCalledWith('帮我做一个 /birdcoder-daily-dev ')
  })

  it('a staged token mid-draft is swapped in place, preserving surrounding text', () => {
    const { view, actions } = mount({ draft: '帮我 /birdcoder-storyboard 分镜' })
    fireEvent.click(view.container.querySelector('[title="/birdcoder-agent-app"]')!)
    expect(actions.setDraft).toHaveBeenCalledWith('帮我 分镜 /birdcoder-agent-app ')
  })

  it('a trailing partial token is replaced by the next tag pick', () => {
    const { view, actions } = mount({ draft: '帮我 /birdcoder-video' })
    fireEvent.click(view.container.querySelector('[title="/birdcoder-daily-dev"]')!)
    expect(actions.setDraft).toHaveBeenCalledWith('帮我 /birdcoder-daily-dev ')
  })

  it('the strip follows the staged scene', () => {
    const { view, scene } = mount()
    expect(view.container.querySelector('[data-scene-skills="code"]')).not.toBeNull()
    act(() => { scene.set('video') })
    expect(view.container.querySelector('[data-scene-skills="video"]')).not.toBeNull()
    const tags = [...view.container.querySelectorAll('[data-scene-skills="video"] button')]
    expect(tags.map(tag => tag.getAttribute('title'))).toEqual([
      '/birdcoder-short-video', '/birdcoder-video', '/birdcoder-image', '/birdcoder-music',
      '/birdcoder-sound-effect', '/birdcoder-tts', '/birdcoder-poster',
    ])
  })

  it('renders nothing once the conversation has started', () => {
    // A live conversation: the session is no longer blank (running turn).
    const { view } = mount({ session: { running: true } })
    expect(view.container.querySelector('[data-scene-skills]')).toBeNull()
    // An engaging session (first prompt attempted) also hides the strip.
    const engaging = mount({ session: { promptAttempted: true } })
    expect(engaging.view.container.querySelector('[data-scene-skills]')).toBeNull()
  })

  it('the document scene leads with the four generation skills', () => {
    const { view, scene } = mount()
    act(() => { scene.set('document') })
    const tags = [...view.container.querySelectorAll('[data-scene-skills="document"] button')]
    expect(tags.map(tag => tag.getAttribute('title'))).toEqual([
      '/birdcoder-lesson-plan', '/birdcoder-courseware', '/birdcoder-business-plan', '/birdcoder-product-ppt',
      '/birdcoder-ppt-design', '/birdcoder-visual-poster', '/birdcoder-marketing-poster', '/birdcoder-meeting-notes',
    ])
  })
})
