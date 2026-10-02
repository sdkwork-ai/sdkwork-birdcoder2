/**
 * Linked-app resolution (`deployAppFlow`): the persisted manifest ID is
 * authoritative while it resolves; a read failure and a stale (deleted) ID
 * both fall through to the caller's picker step.
 */
import { describe, expect, it } from 'vitest'

import type { DeployAppConfigLink } from '../src/client/deployAppConfig.ts'
import { resolveLinkedApp } from '../src/client/deployAppFlow.ts'

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
