/**
 * Target-app resolution (`deployAppFlow`): the persisted manifest ID is
 * authoritative while it resolves; a read failure and a stale (deleted) ID
 * both fall through to the caller's create/picker step.
 */
import { describe, expect, it } from 'vitest'

import type { DeployAppConfigLink } from '../src/client/deployAppConfig.ts'
import { resolveLinkedApp, resolveLinkedAppWith, resolveProjectApp } from '../src/client/deployAppFlow.ts'
import type { ProjectAppState } from '../src/client/projectApp.ts'

const LINK: DeployAppConfigLink = { appId: 'app-uuid-1', appName: 'Feishu Portal' }
const APP = { id: 'app-uuid-1', name: 'Feishu Portal', slug: 'feishu-portal' }

describe('resolveLinkedApp', () => {
  it('returns the app when the persisted ID still resolves', async () => {
    const resolution = await resolveLinkedApp(
      async () => LINK,
      async (appId) => {
        expect(appId).toBe('app-uuid-1')
        return APP as never
      },
    )
    expect(resolution.link).toEqual(LINK)
    expect(resolution.app).toEqual(APP as never)
    expect(resolution.staleLink).toBe(false)
  })

  it('marks the linkage stale when the persisted app no longer resolves', async () => {
    const resolution = await resolveLinkedApp(
      async () => LINK,
      async () => {
        throw new Error('not found')
      },
    )
    expect(resolution.link).toEqual(LINK)
    expect(resolution.app).toBeUndefined()
    expect(resolution.staleLink).toBe(true)
  })

  it('reports no link when the manifest read fails or carries none', async () => {
    const failing = await resolveLinkedApp(
      async () => {
        throw new Error('workspace bridge unavailable')
      },
      async () => APP as never,
    )
    expect(failing).toEqual({ staleLink: false })

    const empty = await resolveLinkedApp(
      async () => undefined,
      async () => APP as never,
    )
    expect(empty).toEqual({ staleLink: false })
  })
})

describe('resolveLinkedAppWith', () => {
  it('binds the resolution to a constructed deploy client', async () => {
    const resolve = resolveLinkedAppWith({ app: { retrieve: async (appId: string) => ({ ...APP, id: appId }) } } as never)
    const resolution = await resolve(async () => LINK)
    expect(resolution).toEqual({ link: LINK, app: { ...APP, id: 'app-uuid-1' }, staleLink: false })
    expect(await resolve(async () => { throw new Error('read failed') })).toEqual({ staleLink: false })
  })
})

describe('resolveProjectApp', () => {
  const linkedState: ProjectAppState = { hasManifest: true, linkedAppId: 'app-uuid-1', link: LINK }

  it('reports linked with the fetched app and the manifest linkage', async () => {
    const resolution = await resolveProjectApp(
      async () => linkedState,
      async (appId) => {
        expect(appId).toBe('app-uuid-1')
        return APP as never
      },
    )
    expect(resolution).toEqual({ status: 'linked', app: APP as never, link: LINK })
  })

  it('reports linked without a link when the state carries only the id', async () => {
    expect(await resolveProjectApp(
      async () => ({ hasManifest: true, linkedAppId: 'app-uuid-1' }),
      async () => APP as never,
    )).toEqual({ status: 'linked', app: APP as never })
  })

  it('reports unlinked when the manifest records no app', async () => {
    expect(await resolveProjectApp(async () => ({ hasManifest: true }), async () => APP as never))
      .toEqual({ status: 'unlinked' })
    // A failing manifest read degrades to the same answer.
    expect(await resolveProjectApp(async () => { throw new Error('bridge down') }, async () => APP as never))
      .toEqual({ status: 'unlinked' })
  })

  it('reports stale when the recorded app no longer resolves', async () => {
    const resolution = await resolveProjectApp(
      async () => linkedState,
      async () => { throw new Error('not found') },
    )
    expect(resolution).toEqual({ status: 'stale', link: LINK })
    // A state without a provenance link still reports stale.
    expect(await resolveProjectApp(
      async () => ({ hasManifest: true, linkedAppId: 'app-uuid-1' }),
      async () => { throw new Error('not found') },
    )).toEqual({ status: 'stale' })
  })
})
