/**
 * The hosted OAuth session-end URLs: the one place the desktop logout endpoint,
 * the page-local sign-out page, and their query shape are named.
 */
import { describe, expect, it } from 'vitest'
import {
  SDKWORK_OAUTH_LOGOUT_PATH,
  SDKWORK_OAUTH_SIGN_OUT_PATH,
  buildOauthLogoutUrl,
  buildOauthSignOutUrl,
} from '../src/client/oauth-session.ts'

describe('OAuth session-end URLs', () => {
  it('names the endpoints of the hosted OAuth group', () => {
    expect(SDKWORK_OAUTH_LOGOUT_PATH).toBe('/oauth/logout')
    expect(SDKWORK_OAUTH_SIGN_OUT_PATH).toBe('/oauth/sign-out')
  })

  it('scopes the logout by the OAuth client that signed in', () => {
    expect(buildOauthLogoutUrl('https://platform.birdcoder.com', 'birdcoder'))
      .toBe('https://platform.birdcoder.com/oauth/logout?client_id=birdcoder')
  })

  it('normalizes a padded origin and an encoded client id', () => {
    expect(buildOauthLogoutUrl(' https://platform.birdcoder.com/ ', 'birdcoder'))
      .toBe('https://platform.birdcoder.com/oauth/logout?client_id=birdcoder')
    expect(buildOauthLogoutUrl('http://platform-dev.birdcoder.com', 'acme app'))
      .toBe('http://platform-dev.birdcoder.com/oauth/logout?client_id=acme%20app')
  })

  it('builds the page-local sign-out URL without a client binding', () => {
    expect(buildOauthSignOutUrl('https://platform.birdcoder.com'))
      .toBe('https://platform.birdcoder.com/oauth/sign-out')
    expect(buildOauthSignOutUrl('http://platform-dev.birdcoder.com/'))
      .toBe('http://platform-dev.birdcoder.com/oauth/sign-out')
  })
})
