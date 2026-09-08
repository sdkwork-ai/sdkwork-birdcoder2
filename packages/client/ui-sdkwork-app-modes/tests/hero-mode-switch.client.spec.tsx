// @vitest-environment jsdom
/**
 * Hero scene-switcher spec: the connected segmented pill bar renders one
 * scene per chip in order, keeps Code as the resting staging, and stages on
 * click without navigating — the frame mode must never be touched from the
 * pills. A gated scene raises the sign-in overlay at staging time while
 * signed out. (The staged scene's skill tags live below the composer card;
 * see scene-skill-tags.client.spec.tsx.)
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore as createRuntimeSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { HeroModeSwitch, type HeroModeSwitchProps } from '../src/client/HeroModeSwitch.tsx'
import { createHeroSceneStore } from '../src/client/hero-scene-store.ts'
import type { AuthenticatedModeGate } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as HeroModeSwitchProps['t']

/** Empty root standard-kit hooks (the switcher reads none). */
function emptySessions() {
  return bindSnapshotSelector(createRuntimeSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createRuntimeSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore(new Map<never, never>()))
}

/** IAM gate fake with configurable signed-in state and an overlay spy. */
function gateOf(signedIn: boolean) {
  return {
    isSignedIn: () => signedIn,
    openSignInOverlay: vi.fn(),
    subscribe: () => () => {},
  } satisfies AuthenticatedModeGate
}

function mount(options: { gate?: AuthenticatedModeGate } = {}) {
  const scene = createHeroSceneStore()
  const view = render(
    <HeroModeSwitch
      useSessions={emptySessions()}
      useWorkspaces={emptyWorkspaces()}
      useSessionPendingInteraction={noPendingInteraction()}
      authGate={options.gate}
      scene={scene}
      t={t}
    />,
  )
  return { view, scene }
}

describe('HeroModeSwitch', () => {
  it('renders one chip per scene in order, with Code staged and the others not', () => {
    const { view } = mount()
    const pills = [...view.container.querySelectorAll('[data-scene-pills] > button')]
    expect(pills.map(p => p.textContent)).toEqual([
      'heroSwitch.code', 'heroSwitch.video', 'heroSwitch.document',
    ])
    expect(pills.map(p => p.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    // The resting staging carries the active chrome; idle chips do not.
    expect(pills[0]!.className).toContain('active')
    expect(pills[1]!.className).not.toContain('active')
    // The group announces itself for assistive tech.
    expect(view.container.querySelector('[data-scene-pills]')!.getAttribute('aria-label')).toBe('heroSwitch.group')
  })

  it('stages a scene on click without switching the frame mode', () => {
    const { view, scene } = mount()
    const pills = () => [...view.container.querySelectorAll('[data-scene-pills] > button')]
    fireEvent.click(pills()[1]!) // video
    // Staging is store state, not navigation: the selection moves on screen.
    expect(scene.get()).toBe('video')
    expect(pills().map(p => p.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(pills()[1]!.className).toContain('active')
    fireEvent.click(pills()[0]!) // back to code — the resting scene
    expect(scene.get()).toBe('code')
  })

  it('a gated scene raises the sign-in overlay at staging time while signed out', () => {
    const gate = gateOf(false)
    const { view, scene } = mount({ gate })
    fireEvent.click([...view.container.querySelectorAll('[data-scene-pills] > button')][1]!)
    expect(gate.openSignInOverlay).toHaveBeenCalledTimes(1)
    // The staging still lands: signing in leaves the staged scene intact.
    expect(scene.get()).toBe('video')
  })

  it('a signed-in gate stages without the overlay, and ungated scenes never open it', () => {
    const gate = gateOf(true)
    const { view, scene } = mount({ gate })
    fireEvent.click([...view.container.querySelectorAll('[data-scene-pills] > button')][1]!)
    fireEvent.click([...view.container.querySelectorAll('[data-scene-pills] > button')][2]!)
    expect(gate.openSignInOverlay).not.toHaveBeenCalled()
    expect(scene.get()).toBe('document')
  })
})
