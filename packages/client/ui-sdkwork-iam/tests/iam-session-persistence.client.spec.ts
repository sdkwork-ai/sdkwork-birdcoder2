import { describe, expect, it } from 'vitest'
import {
  isPersistableStoredSession,
  toRestoredAuthSession,
} from '../src/client/iam-session-persistence.ts'

describe('iam-session-persistence', () => {
  it('accepts a complete unexpired dual-token session', () => {
    const session = { accessToken: 'at', authToken: 'auth', expiresAt: Date.now() + 60_000 }
    expect(isPersistableStoredSession(session)).toBe(true)
  })

  it('rejects incomplete or expired stored sessions', () => {
    expect(isPersistableStoredSession({ accessToken: 'at' })).toBe(false)
    expect(isPersistableStoredSession({ authToken: 'auth' })).toBe(false)
    expect(isPersistableStoredSession({
      accessToken: 'at',
      authToken: 'auth',
      expiresAt: Date.now() - 1,
    })).toBe(false)
  })

  it('projects stored identity fields onto the controller session', () => {
    const restored = toRestoredAuthSession({
      accessToken: 'at',
      authToken: 'auth',
      refreshToken: 'rt',
      user: { id: 'u1', displayName: 'Bird' },
    })
    expect(restored).toEqual({
      accessToken: 'at',
      authToken: 'auth',
      refreshToken: 'rt',
      user: {
        id: 'u1',
        displayName: 'Bird',
        email: '',
        firstName: 'Bird',
        initials: 'B',
        lastName: '',
        username: undefined,
      },
    })
  })
})
