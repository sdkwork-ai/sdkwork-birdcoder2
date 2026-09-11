/**
 * Deferred sign-in requirement spec: which requests must wait for a session,
 * and how the interceptor holds one until the answer arrives.
 */
import { describe, expect, it, vi } from 'vitest'
import type { RequestConfig } from '@sdkwork/sdk-common'
import {
  createSignInRequestInterceptor,
  isUserInitiatedRequest,
  requiresSignedInSession,
  SdkworkSignInRequiredError,
} from '../src/client/sign-in-requirement.ts'

/** A request config carrying only what the gate reads. */
function configOf(method: string, skipAuth?: boolean): RequestConfig {
  return {
    url: '/generations/images/text_to_image',
    method: method as RequestConfig['method'],
    ...(skipAuth === undefined ? {} : { skipAuth }),
  }
}

describe('isUserInitiatedRequest', () => {
  it('treats state-changing methods as user gestures', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', ' patch ']) {
      expect(isUserInitiatedRequest(method)).toBe(true)
    }
  })

  it('treats reads as page-issued traffic', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isUserInitiatedRequest(method)).toBe(false)
    }
  })
})

describe('requiresSignedInSession', () => {
  it('gates a mutation the user asked for', () => {
    expect(requiresSignedInSession(configOf('POST'))).toBe(true)
  })

  it('lets the page load its own reads while signed out', () => {
    // A read is issued by the mounting page, so gating it would turn opening
    // the generator into a login wall.
    expect(requiresSignedInSession(configOf('GET'))).toBe(false)
  })

  it('honours the SDK skipAuth marker on a mutation', () => {
    expect(requiresSignedInSession(configOf('POST', true))).toBe(false)
  })

  it('leaves an anonymous read ungated', () => {
    expect(requiresSignedInSession(configOf('GET', false))).toBe(false)
  })
})

describe('createSignInRequestInterceptor', () => {
  it('passes an exempt request through without touching the requirement', async () => {
    const isSignedIn = vi.fn(() => false)
    const requireSignedIn = vi.fn(async () => {})
    const interceptor = createSignInRequestInterceptor({ isSignedIn, requireSignedIn })
    const config = configOf('GET')

    await expect(interceptor(config)).resolves.toBe(config)
    expect(isSignedIn).not.toHaveBeenCalled()
    expect(requireSignedIn).not.toHaveBeenCalled()
  })

  it('dispatches a gated request at once while signed in', async () => {
    const requireSignedIn = vi.fn(async () => {})
    const interceptor = createSignInRequestInterceptor({
      isSignedIn: () => true,
      requireSignedIn,
    })
    const config = configOf('POST')

    await expect(interceptor(config)).resolves.toBe(config)
    expect(requireSignedIn).not.toHaveBeenCalled()
  })

  it('holds a gated request until the session arrives, then releases it', async () => {
    let grantSignIn: () => void = () => {}
    const requireSignedIn = vi.fn(() => new Promise<void>((resolve) => { grantSignIn = resolve }))
    const interceptor = createSignInRequestInterceptor({
      isSignedIn: () => false,
      requireSignedIn,
    })
    const config = configOf('POST')

    let settled = false
    const dispatch = interceptor(config).then((next) => { settled = true; return next })
    // The call is suspended, not failed: nothing has been dispatched yet.
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(requireSignedIn).toHaveBeenCalledTimes(1)

    grantSignIn()
    await expect(dispatch).resolves.toBe(config)
  })

  it('rejects the request when the user declines to sign in', async () => {
    const interceptor = createSignInRequestInterceptor({
      isSignedIn: () => false,
      requireSignedIn: () => Promise.reject(new SdkworkSignInRequiredError()),
    })

    await expect(interceptor(configOf('POST'))).rejects.toBeInstanceOf(SdkworkSignInRequiredError)
  })

  it('accepts a caller-supplied rule over the default', async () => {
    const requireSignedIn = vi.fn(async () => {})
    const interceptor = createSignInRequestInterceptor(
      { isSignedIn: () => false, requireSignedIn },
      config => config.url.endsWith('/favorite'),
    )

    await expect(interceptor(configOf('GET'))).resolves.toBeDefined()
    expect(requireSignedIn).not.toHaveBeenCalled()

    const favorite = { url: '/generations/g1/favorite', method: 'GET' as RequestConfig['method'] }
    await expect(interceptor(favorite)).resolves.toBe(favorite)
    expect(requireSignedIn).toHaveBeenCalledTimes(1)
  })
})

describe('SdkworkSignInRequiredError', () => {
  it('carries a default message the calling surface can show', () => {
    const error = new SdkworkSignInRequiredError()
    expect(error.name).toBe('SdkworkSignInRequiredError')
    expect(error.code).toBe('SDKWORK_SIGN_IN_REQUIRED')
    expect(error.message).toBe('SDKWork sign-in is required to run this operation')
    expect(error).toBeInstanceOf(Error)
  })

  it('accepts a caller-supplied message', () => {
    expect(new SdkworkSignInRequiredError('登录后可继续生成').message).toBe('登录后可继续生成')
  })
})
