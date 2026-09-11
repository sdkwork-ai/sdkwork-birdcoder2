// @vitest-environment jsdom
/**
 * Gated mode-page shell spec. Under the eager policy, mounting while signed
 * out renders the sign-in notice and opens nothing — a page the user did not
 * explicitly open must not answer with a modal — while the notice's own button
 * is the explicit way into the overlay; signed in, the shell mounts the page.
 * Under the deferred policy the page mounts either way and no notice exists,
 * because the requirement belongs to the backend transport.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { AuthenticatedModeShell } from '../src/client/AuthenticatedModeShell.tsx'
import { injectAuthenticatedModePage, type AuthenticatedModeGate } from '../src/client/authenticated-mode.ts'

/** IAM gate fake with a configurable session and an overlay spy. */
function gateOf(signedIn: boolean): AuthenticatedModeGate & { openSignInOverlay: ReturnType<typeof vi.fn> } {
  return {
    isSignedIn: () => signedIn,
    openSignInOverlay: vi.fn(),
    subscribe: () => () => {},
  }
}

function mount(gate: AuthenticatedModeGate, policy?: 'eager' | 'deferred') {
  return render(
    <AuthenticatedModeShell
      gate={gate}
      {...(policy === undefined ? {} : { policy })}
      title="登录后使用视频生成"
      detail="视频生成需要登录后才能创建和管理你的生成作品。"
      actionLabel="登录"
    >
      <div data-testid="page" />
    </AuthenticatedModeShell>,
  )
}

describe('AuthenticatedModeShell', () => {
  it('renders the notice signed out without opening the overlay on mount', () => {
    const gate = gateOf(false)
    const { container } = mount(gate)
    expect(container.querySelector('[data-auth-required="true"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="page"]')).toBeNull()
    // The regression pin: an implicit arrival states the requirement in
    // place; only the notice's own button asks for a session.
    expect(gate.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('opens the overlay from the notice button', () => {
    const gate = gateOf(false)
    const { container } = mount(gate)
    fireEvent.click(within(container).getByRole('button', { name: '登录' }))
    expect(gate.openSignInOverlay).toHaveBeenCalledTimes(1)
  })

  it('mounts the page while signed in and never raises the notice', () => {
    const gate = gateOf(true)
    const { container } = mount(gate)
    expect(container.querySelector('[data-testid="page"]')).not.toBeNull()
    expect(container.querySelector('[data-auth-required="true"]')).toBeNull()
    expect(gate.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('mounts a deferred page while signed out and raises nothing', () => {
    // A deferred page is browsable on purpose: the interface renders, no
    // notice stands in for it, and opening the mode still does not open the
    // overlay — the backend transport asks when a request needs a session.
    const gate = gateOf(false)
    const { container } = mount(gate, 'deferred')
    expect(container.querySelector('[data-testid="page"]')).not.toBeNull()
    expect(container.querySelector('[data-auth-required="true"]')).toBeNull()
    expect(gate.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('mounts a deferred page without signing-in copy', () => {
    const gate = gateOf(false)
    const { container } = render(
      <AuthenticatedModeShell gate={gate} policy="deferred">
        <div data-testid="page" />
      </AuthenticatedModeShell>,
    )
    expect(container.querySelector('[data-testid="page"]')).not.toBeNull()
  })

  it('injects the live gate beside the mode id', () => {
    const gate = gateOf(true)
    const injected = injectAuthenticatedModePage({ get: () => gate }, 'video')
    expect(injected.mode).toBe('video')
    expect(injected.authGate).toBe(gate)
  })
})
