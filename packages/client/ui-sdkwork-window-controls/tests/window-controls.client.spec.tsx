// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { DesktopWindowControls } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  FloatingWindowControls, WindowControls, platformOf, resolvePlatform,
  type FloatingWindowControlsProps, type WindowControlsPlatform, type WindowControlsProps,
} from '../src/client/WindowControls.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A controllable fake bridge surface; every function member stays a Mock so assertions bind. */
type MockSurface = DesktopWindowControls & {
  minimize: Mock<() => void>
  toggleMaximize: Mock<() => void>
  close: Mock<() => void>
  isMaximized: Mock<() => Promise<boolean>>
  onMaximizedChanged: Mock<(listener: (maximized: boolean) => void) => () => void>
  detach: Mock<() => void>
}

/** Mock-typed overrides accepted by {@link controls}; tests pass real mocks. */
type MockOverrides = Partial<{
  minimize: Mock<() => void>
  toggleMaximize: Mock<() => void>
  close: Mock<() => void>
  isMaximized: Mock<() => Promise<boolean>>
  onMaximizedChanged: Mock<(listener: (maximized: boolean) => void) => () => void>
}>

function controls(over: Partial<DesktopWindowControls> = {}): MockSurface {
  const detach = vi.fn()
  const overrides = over as MockOverrides
  return {
    minimize: overrides.minimize ?? vi.fn(),
    toggleMaximize: overrides.toggleMaximize ?? vi.fn(),
    close: overrides.close ?? vi.fn(),
    isMaximized: overrides.isMaximized ?? vi.fn(async () => false),
    onMaximizedChanged: overrides.onMaximizedChanged ?? vi.fn(() => detach),
    detach,
  }
}

function inlineProps(
  windowControls: DesktopWindowControls | undefined,
  platform: WindowControlsPlatform = 'win32',
): WindowControlsProps {
  return { windowControls, platform } as unknown as WindowControlsProps
}

/** Representative session-list facts supplied by the root slot runtime. */
interface FloatingState {
  current?: SessionId | undefined
  byId?: Record<string, { blank: boolean }> | undefined
}

function floatingProps(
  state: FloatingState,
  windowControls: DesktopWindowControls | undefined,
  platform: WindowControlsPlatform = 'win32',
): FloatingWindowControlsProps {
  const useSessions = <T,>(select: (snapshot: SessionListState) => T): T => select({
    current: state.current,
    byId: state.byId ?? {},
  } as unknown as SessionListState)
  return { useSessions, windowControls, platform } as unknown as FloatingWindowControlsProps
}

const SESSION = 's1' as SessionId

describe('WindowControls header spacer', () => {
  it('renders nothing without the preload surface', () => {
    const { container } = render(<WindowControls {...inlineProps(undefined)} />)
    expect(container.innerHTML).toBe('')
  })

  it('reserves the host platform footprint without mounting another control cluster', () => {
    const { container } = render(<WindowControls {...inlineProps(controls(), 'linux')} />)
    expect(screen.queryByRole('group', { name: '窗口控制' })).toBeNull()
    expect(container.firstElementChild?.getAttribute('data-platform')).toBe('linux')
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('resolvePlatform', () => {
  it.each([
    ['Win32', 'win32'],
    ['Windows', 'win32'],
    ['MacIntel', 'darwin'],
    ['Darwin', 'darwin'],
    ['Linux x86_64', 'linux'],
    ['iPhone', 'other'],
  ])('maps %s to %s', (raw, expected) => {
    expect(resolvePlatform(raw)).toBe(expected)
  })
})

describe('platformOf', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves the convention set from the renderer platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(platformOf()).toBe('darwin')
  })

  it('prefers the user-agent platform when Chromium exposes it', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: { platform: 'Linux' } })
    expect(platformOf()).toBe('linux')
  })

  it('falls back to the default set when the navigator platform is absent', () => {
    vi.stubGlobal('navigator', undefined)
    expect(platformOf()).toBe('other')
  })
})

describe('FloatingWindowControls', () => {
  it('renders the three controls and wires each action', async () => {
    const surface = controls()
    render(<FloatingWindowControls {...floatingProps({ current: undefined, byId: {} }, surface)} />)
    await screen.findByRole('button', { name: '最大化' })
    expect(screen.getByRole('group', { name: '窗口控制' })).toBeDefined()
    act(() => { screen.getByRole('button', { name: '最小化' }).click() })
    act(() => { screen.getByRole('button', { name: '最大化' }).click() })
    act(() => { screen.getByRole('button', { name: '关闭' }).click() })
    expect(surface.minimize).toHaveBeenCalledTimes(1)
    expect(surface.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(surface.close).toHaveBeenCalledTimes(1)
    expect(surface.isMaximized).toHaveBeenCalledTimes(1)
    expect(surface.onMaximizedChanged).toHaveBeenCalledTimes(1)
  })

  it('starts from the live maximize state and follows pushed flips', async () => {
    const surface = controls({ isMaximized: vi.fn(async () => true) })
    render(<FloatingWindowControls {...floatingProps({}, surface)} />)
    await screen.findByRole('button', { name: '还原' })
    expect(surface.isMaximized).toHaveBeenCalledTimes(1)
    const listener = vi.mocked(surface.onMaximizedChanged).mock.calls[0]?.[0]
    expect(listener).toBeDefined()
    act(() => { listener!(false) })
    await screen.findByRole('button', { name: '最大化' })
    act(() => { listener!(true) })
    await screen.findByRole('button', { name: '还原' })
  })

  it('detaches the subscription on unmount', async () => {
    const surface = controls()
    const { unmount } = render(<FloatingWindowControls {...floatingProps({}, surface)} />)
    await screen.findByRole('button', { name: '最大化' })
    unmount()
    expect(surface.detach).toHaveBeenCalledTimes(1)
  })

  it('ignores a maximize query that resolves after unmount', () => {
    let resolve!: (state: boolean) => void
    const pending = new Promise<boolean>((done) => { resolve = done })
    const surface = controls({ isMaximized: vi.fn(() => pending) })
    const { unmount } = render(<FloatingWindowControls {...floatingProps({}, surface)} />)
    unmount()
    expect(() => { act(() => { resolve(true) }) }).not.toThrow()
    expect(surface.detach).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['without a current session', { current: undefined, byId: {} }],
    ['for a blank session', { current: SESSION, byId: { [SESSION]: { blank: true } } }],
    ['for a populated session', { current: SESSION, byId: { [SESSION]: { blank: false } } }],
    ['while the current summary is unknown', { current: SESSION, byId: {} }],
  ] satisfies [string, FloatingState][])('stays mounted %s', async (_label, state) => {
    render(<FloatingWindowControls {...floatingProps(state, controls())} />)
    await screen.findByRole('button', { name: '关闭' })
  })

  it('renders nothing without the preload surface', () => {
    const { container } = render(<FloatingWindowControls {...floatingProps({}, undefined)} />)
    expect(container.innerHTML).toBe('')
  })

  it('tags the frame anchor and cluster with the host platform convention', () => {
    const { container } = render(<FloatingWindowControls {...floatingProps({}, controls(), 'darwin')} />)
    expect(container.querySelector('[data-dsh-window-controls]')?.getAttribute('data-platform')).toBe('darwin')
    expect(screen.getByRole('group', { name: '窗口控制' }).getAttribute('data-platform')).toBe('darwin')
  })

  it('is the only live control cluster when the Session-header spacer is present', () => {
    const surface = controls()
    render(<>
      <WindowControls {...inlineProps(surface)} />
      <FloatingWindowControls {...floatingProps({ current: SESSION }, surface)} />
    </>)
    expect(screen.getAllByRole('group', { name: '窗口控制' })).toHaveLength(1)
  })
})
