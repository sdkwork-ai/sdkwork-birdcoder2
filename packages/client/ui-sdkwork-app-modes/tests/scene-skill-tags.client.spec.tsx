// @vitest-environment jsdom
/**
 * Scene skill tags spec: the composer-dock strip below the input card lists
 * the staged scene's skills fully expanded (no overflow chrome — the row
 * wraps), appends the skills the skill manager pinned, follows the staged
 * scene, and writes the same `/name ` literal a '/'-menu pick lands through the
 * public draft write in replace mode (one skill per draft). The cold-start
 * variant covers the pre-Workspace Hero, where no session (and so no draft)
 * exists: the same strip renders with every tag disabled.
 *
 * The replace-mode cases matter most for pinned skills that no scene table
 * places: those carry a `/dsh-...` or project name, and a prefix-only token
 * pattern would leave them behind in the draft.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { EMPTY_CONVERSATION_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { sessionSnapshot } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore as createRuntimeSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { HeroSceneSkillTags, SceneSkillTags, type SceneSkillTagsProps } from '../src/client/SceneSkillTags.tsx'
import { createHeroSceneStore } from '../src/client/hero-scene-store.ts'
import { createScenePrefsStore } from '../src/client/scene-prefs-store.ts'
import { SCENE_SKILLS } from '../src/client/scene-skills.ts'

/** Empty global standard-kit hooks (the strip reads neither). */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })

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
    usePanelInfo, useResource,
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

function mount(options: {
  draft?: string
  session?: Partial<SessionSnapshot>
  hiddenTags?: readonly string[]
  pinnedTags?: readonly string[]
} = {}) {
  const inputStore = createSnapshotStore(inputOf(options.draft ?? ''))
  const actions = actionsOf(inputStore)
  const scene = createHeroSceneStore()
  // The suggestion preference the skill manager owns: the strip only mirrors
  // the two name lists the shell hands it.
  const prefs = createScenePrefsStore().create()
  prefs.actions.sync({ hiddenTags: options.hiddenTags ?? [], pinnedTags: options.pinnedTags ?? [] })
  const view = render(
    <SceneSkillTags
      {...emptyKit(options.session)}
      useInput={bindSnapshotSelector(inputStore)}
      inputActions={actions}
      useStore={bindSnapshotSelector(prefs.store)}
      actions={prefs.actions}
      scene={scene}
      t={t}
    />,
  )
  return { view, scene, actions, prefs }
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

  it('replaces a pinned non-builtin token too, not only the birdcoder prefix', () => {
    // The strip now renders pinned skills from every root. A prefix-only token
    // pattern would leave `/dsh-code-review` in the draft and the next pick
    // would accumulate instead of replacing.
    const { view, actions } = mount({
      draft: '/dsh-code-review',
      pinnedTags: ['dsh-code-review', 'team-notes'],
    })
    const tag = view.container.querySelector('[title="/team-notes"]')!
    fireEvent.click(tag)
    expect(actions.setDraft).toHaveBeenCalledWith('/team-notes ')
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

/** Empty root standard-kit hooks (the cold-start variant reads none). */
const useSessions = bindSnapshotSelector(createRuntimeSnapshotStore<SessionListState>({
  ids: [], byId: {}, current: undefined, phase: 'ready',
  subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
}))
const useWorkspaces = bindSnapshotSelector(createRuntimeSnapshotStore<WorkspaceListState>({
  items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: undefined,
}))
const useSessionPendingInteraction = bindSnapshotSelector(createSnapshotStore(new Map<never, never>()))

/** Mount the cold-start variant: the pre-Workspace Hero state, where the shell
 * has no Session to hand the strip (so no session standard kit is passed). */
function mountColdStart(hiddenTags: readonly string[] = [], pinnedTags: readonly string[] = []) {
  const scene = createHeroSceneStore()
  const prefs = createScenePrefsStore().create()
  prefs.actions.sync({ hiddenTags, pinnedTags })
  const view = render(
    <HeroSceneSkillTags
      useSessions={useSessions}
      useWorkspaces={useWorkspaces}
      useSessionPendingInteraction={useSessionPendingInteraction}
      usePanelInfo={usePanelInfo}
      useResource={useResource}
      useStore={bindSnapshotSelector(prefs.store)}
      actions={prefs.actions}
      scene={scene}
      t={t}
    />,
  )
  return { view, scene, prefs }
}

describe('HeroSceneSkillTags (cold start, no session)', () => {
  it('renders the staged scene’s skills, every tag disabled', () => {
    const { view } = mountColdStart()
    const strip = view.container.querySelector('[data-scene-skills="code"]')!
    const tags = [...strip.querySelectorAll<HTMLButtonElement>('button')]
    expect(tags).toHaveLength(SCENE_SKILLS.code.length)
    expect(tags.map(tag => tag.getAttribute('title'))).toEqual(
      SCENE_SKILLS.code.map(skill => `/${skill.skill}`),
    )
    // No draft exists before a Workspace is picked: the tags are a preview, not
    // a control — they announce themselves disabled instead of swallowing a click.
    expect(tags.every(tag => tag.disabled)).toBe(true)
    expect(strip.getAttribute('role')).toBe('group')
    expect(strip.getAttribute('aria-label')).toBe('heroTag.group')
  })

  it('follows the staged scene', () => {
    const { view, scene } = mountColdStart()
    act(() => { scene.set('video') })
    const tags = [...view.container.querySelectorAll<HTMLButtonElement>('[data-scene-skills="video"] button')]
    expect(tags.map(tag => tag.getAttribute('title'))).toEqual([
      '/birdcoder-short-video', '/birdcoder-video', '/birdcoder-image', '/birdcoder-music',
      '/birdcoder-sound-effect', '/birdcoder-tts', '/birdcoder-poster',
    ])
    expect(tags.every(tag => tag.disabled)).toBe(true)
  })

  it('a tag click lands nothing: the pre-Workspace Hero owns no draft machine', () => {
    const { view } = mountColdStart()
    const tag = view.container.querySelector<HTMLButtonElement>('[title="/birdcoder-daily-dev"]')!
    fireEvent.click(tag)
    // The disabled attribute is the contract that the click never reaches a
    // handler — the seated variant above owns the live write path.
    expect(tag.disabled).toBe(true)
    expect(view.container.querySelector('[data-scene-skills="code"]')).not.toBeNull()
  })
})

/**
 * The skill manager's suggestion preference: a name it hides stops rendering
 * here. The list arrives as a declared store, so the component owns no
 * subscription of its own — these cases drive the store the shell would.
 */
describe('SceneSkillTags suggestion preference', () => {
  it('drops the tag whose skill was hidden', () => {
    const { view } = mount({ hiddenTags: ['birdcoder-daily-dev'] })
    const strip = view.container.querySelector('[data-scene-skills="code"]')!
    const titles = [...strip.querySelectorAll('button')].map(tag => tag.getAttribute('title'))

    expect(titles).not.toContain('/birdcoder-daily-dev')
    expect(titles).toContain('/birdcoder-web-dev')
    expect(titles).toHaveLength(SCENE_SKILLS.code.length - 1)
  })

  it('renders nothing for a scene whose whole strip is hidden', () => {
    const { view } = mount({ hiddenTags: SCENE_SKILLS.code.map(tag => tag.skill) })

    expect(view.container.querySelector('[data-scene-skills="code"]')).toBeNull()
  })

  it('follows a later preference change without a remount', () => {
    const { view, prefs } = mount()
    expect(view.container.querySelector('[data-scene-skills="code"]')).not.toBeNull()

    act(() => { prefs.actions.sync({ hiddenTags: SCENE_SKILLS.code.map(tag => tag.skill), pinnedTags: [] }) })

    expect(view.container.querySelector('[data-scene-skills="code"]')).toBeNull()
  })

  it('hides tags on the cold-start strip too', () => {
    const { view } = mountColdStart(['birdcoder-daily-dev'])
    const titles = [...view.container.querySelectorAll('button')].map(tag => tag.getAttribute('title'))

    expect(titles).not.toContain('/birdcoder-daily-dev')
  })
})

/**
 * The other direction of the same preference: a skill the scene table never
 * placed renders because the user pinned it. Those tags have no locale key, so
 * their label is the `/name` token itself.
 */
describe('SceneSkillTags pinned skills', () => {
  it('appends a pinned skill the scene table does not place, labelled by its token', () => {
    const { view } = mount({ pinnedTags: ['team-notes'] })
    const strip = view.container.querySelector('[data-scene-skills="code"]')!
    const tags = [...strip.querySelectorAll('button')]

    expect(tags).toHaveLength(SCENE_SKILLS.code.length + 1)
    const appended = tags[tags.length - 1]!
    expect(appended.getAttribute('title')).toBe('/team-notes')
    expect(appended.textContent).toBe('/team-notes')
  })

  it('keeps the scene table’s own wording for a pinned name that has a seat', () => {
    const { view } = mount({ pinnedTags: ['birdcoder-daily-dev'] })
    const tags = [...view.container.querySelectorAll('[data-scene-skills="code"] button')]

    // No duplicate pill, and the seated entry keeps its localized label.
    expect(tags.filter(tag => tag.getAttribute('title') === '/birdcoder-daily-dev')).toHaveLength(1)
    expect(tags[0]!.textContent).toBe('heroTag.dailyDev')
  })

  it('preserves the pinned order and skips a name that is hidden', () => {
    const { view } = mount({
      pinnedTags: ['team-notes', 'dsh-code-review', 'birdcoder-tts'],
      hiddenTags: ['birdcoder-tts'],
    })
    const tags = [...view.container.querySelectorAll('[data-scene-skills="code"] button')]
    const titles = tags.map(tag => tag.getAttribute('title'))

    // The two non-seated pins follow the table in stored order; the hidden pin
    // is dropped even though it was asked for, because hidden wins.
    expect(titles.slice(-2)).toEqual(['/team-notes', '/dsh-code-review'])
    expect(titles).not.toContain('/birdcoder-tts')
  })

  it('renders a pinned skill on the cold-start strip too', () => {
    const { view } = mountColdStart([], ['team-notes'])
    const tags = [...view.container.querySelectorAll<HTMLButtonElement>('[data-scene-skills="code"] button')]

    expect(tags.map(tag => tag.getAttribute('title'))).toContain('/team-notes')
    expect(tags.every(tag => tag.disabled)).toBe(true)
  })

  it('renders nothing when the whole table is hidden and nothing is pinned', () => {
    const { view } = mount({ hiddenTags: SCENE_SKILLS.code.map(tag => tag.skill) })

    expect(view.container.querySelector('[data-scene-skills="code"]')).toBeNull()
  })

  it('shows a pinned skill even when the whole scene table is hidden', () => {
    const { view } = mount({
      hiddenTags: SCENE_SKILLS.code.map(tag => tag.skill),
      pinnedTags: ['team-notes'],
    })
    const titles = [...view.container.querySelectorAll('[data-scene-skills="code"] button')]
      .map(tag => tag.getAttribute('title'))

    expect(titles).toEqual(['/team-notes'])
  })
})
