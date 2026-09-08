/**
 * The authenticated-mode registry: Markets browses signed out — it is not in
 * `AUTHENTICATED_APP_MODES`, so switching to it never opens the sign-in
 * overlay — while a still-gated mode keeps the overlay dispatch.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  AUTHENTICATED_APP_MODES,
  isAuthenticatedAppMode,
  requestAuthenticatedMode,
  type AuthenticatedModeGate,
} from '../src/client/authenticated-mode.ts'

function gate(signedIn: boolean): AuthenticatedModeGate & { openSignInOverlay: () => void } {
  return {
    isSignedIn: () => signedIn,
    openSignInOverlay: vi.fn(),
    subscribe: () => () => {},
  }
}

describe('authenticated app modes', () => {
  it('keeps Markets reachable while signed out', () => {
    expect(AUTHENTICATED_APP_MODES).not.toContain('markets')
    expect(isAuthenticatedAppMode('markets')).toBe(false)
  })

  it('switches to Markets signed out without opening the sign-in overlay', () => {
    const signedOut = gate(false)
    const setMode = vi.fn()
    requestAuthenticatedMode(signedOut, 'markets', setMode)
    expect(setMode).toHaveBeenCalledWith('markets')
    expect(signedOut.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('still opens the sign-in overlay for a gated mode signed out', () => {
    const signedOut = gate(false)
    const setMode = vi.fn()
    requestAuthenticatedMode(signedOut, 'knowledge', setMode)
    expect(setMode).toHaveBeenCalledWith('knowledge')
    expect(signedOut.openSignInOverlay).toHaveBeenCalledOnce()
  })

  it('switches to a gated mode signed in without the overlay', () => {
    const signedIn = gate(true)
    const setMode = vi.fn()
    requestAuthenticatedMode(signedIn, 'knowledge', setMode)
    expect(setMode).toHaveBeenCalledWith('knowledge')
    expect(signedIn.openSignInOverlay).not.toHaveBeenCalled()
  })
})
