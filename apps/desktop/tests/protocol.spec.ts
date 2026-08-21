/**
 * app:// protocol wiring: the scheme is registered privileged once, and the
 * handler serves exactly one origin (app://dsh) through the carrier's
 * dispatch, refusing every other hostname.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

let schemeHandler: ((request: Request) => Promise<Response>) | undefined
let registeredScheme: unknown

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: (schemes: unknown) => { registeredScheme = schemes },
    handle: (scheme: string, handler: (request: Request) => Promise<Response>) => {
      if (scheme === 'app') schemeHandler = handler
    },
  },
}))

import { APP_INDEX_URL, registerAppScheme, registerDesktopProtocol } from '../src/protocol.ts'
import type { DesktopWebServer } from '@deepseek-ai/dsh-sdkwork-desktop-carrier'

beforeEach(() => {
  schemeHandler = undefined
  registeredScheme = undefined
})

describe('app:// protocol', () => {
  it('registers the scheme as standard, secure, fetch-capable, and streamable', () => {
    registerAppScheme()
    expect(registeredScheme).toEqual([{
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    }])
  })

  it('dispatches app://dsh requests through the carrier', async () => {
    registerAppScheme()
    const dispatch = vi.fn(async (_request: Request) => new Response('ok', { status: 200 }))
    const carrier = { dispatch } as unknown as DesktopWebServer
    registerDesktopProtocol(carrier)
    expect(schemeHandler).toBeDefined()
    const response = await schemeHandler?.(new Request(`${APP_INDEX_URL}?v=1`))
    expect(response?.status).toBe(200)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toBeInstanceOf(Request)
  })

  it('refuses every other hostname without dispatching', async () => {
    registerAppScheme()
    const dispatch = vi.fn()
    registerDesktopProtocol({ dispatch } as unknown as DesktopWebServer)
    const response = await schemeHandler?.(new Request('app://evil/index.html'))
    expect(response?.status).toBe(404)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('answers 400 on an unparsable request URL', async () => {
    registerAppScheme()
    const dispatch = vi.fn()
    registerDesktopProtocol({ dispatch } as unknown as DesktopWebServer)
    const response = await schemeHandler?.({ url: '://bad' } as Request)
    expect(response?.status).toBe(400)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
