/**
 * Project app creation (`projectAppCreate`): the duplicate guard, the order of
 * the three persisted facts, and the recoverable failures (linkage write and
 * platform-target registration).
 */
import { describe, expect, it, vi } from 'vitest'

import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import type { ProjectAppDraft, ProjectAppState } from '../src/client/projectApp.ts'
import { createProjectApp, type CreateProjectAppPorts } from '../src/client/projectAppCreate.ts'

const DRAFT: ProjectAppDraft = {
  name: 'SDKWork Store',
  cardId: 'pc-web',
  description: 'Everything store.',
  appKey: 'sdkwork-store',
}

const STATE: ProjectAppState = {
  hasManifest: true,
  directory: '/w/store',
  profileId: 'standalone.development',
}

/** One deploy_app response carrying the fields creation reads. */
function app(overrides: Partial<AppResponse> = {}): AppResponse {
  return {
    id: 'app-uuid-1',
    name: 'SDKWork Store',
    slug: 'sdkwork-store',
    appKind: 'SPA_WEB',
    appStatus: 'DRAFT',
    defaultEnvironment: 'development',
    ownerType: 'USER',
    tenantId: '100001',
    nginxConfigOverridden: false,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

/** Ports with every side effect observed. */
function ports(overrides: Partial<CreateProjectAppPorts> = {}) {
  return {
    createRecord: vi.fn<CreateProjectAppPorts['createRecord']>(async () => app()),
    createTarget: vi.fn<CreateProjectAppPorts['createTarget']>(async () => undefined),
    writeLink: vi.fn<CreateProjectAppPorts['writeLink']>(async () => true),
    ...overrides,
  } satisfies CreateProjectAppPorts
}

describe('createProjectApp', () => {
  it('creates the record, links it, then registers the platform target', async () => {
    const sideEffects = ports()
    const outcome = await createProjectApp(sideEffects, { state: STATE, draft: DRAFT })
    expect(outcome).toEqual({
      status: 'created',
      app: app(),
      linked: true,
      targetCreated: true,
    })
    expect(sideEffects.createRecord).toHaveBeenCalledWith({
      name: 'SDKWork Store',
      cardId: 'pc-web',
      description: 'Everything store.',
    })
    expect(sideEffects.writeLink).toHaveBeenCalledWith({
      appId: 'app-uuid-1',
      appName: 'SDKWork Store',
      appSlug: 'sdkwork-store',
      appKey: 'sdkwork-store',
      sourceDirectory: '/w/store',
    }, app())
    expect(sideEffects.createTarget).toHaveBeenCalledWith('app-uuid-1', 'pc-web')
  })

  it('omits the optional draft and directory fields', async () => {
    const sideEffects = ports()
    await createProjectApp(sideEffects, {
      state: { hasManifest: false },
      draft: { name: 'Untitled app' },
    })
    expect(sideEffects.createRecord).toHaveBeenCalledWith({ name: 'Untitled app' })
    expect(sideEffects.writeLink).toHaveBeenCalledWith({
      appId: 'app-uuid-1',
      appName: 'SDKWork Store',
      appSlug: 'sdkwork-store',
    }, app())
    // No card means no target registration at all.
    expect(sideEffects.createTarget).not.toHaveBeenCalled()
  })

  it('refuses to create when the project already records another app', async () => {
    const sideEffects = ports()
    const outcome = await createProjectApp(sideEffects, {
      state: { ...STATE, linkedAppId: 'app-other' },
      draft: DRAFT,
    })
    expect(outcome).toEqual({ status: 'already-linked', appId: 'app-other' })
    expect(sideEffects.createRecord).not.toHaveBeenCalled()
    expect(sideEffects.writeLink).not.toHaveBeenCalled()
  })

  it('allows replacing the stale id the caller acknowledged', async () => {
    const sideEffects = ports()
    const outcome = await createProjectApp(sideEffects, {
      state: { ...STATE, linkedAppId: 'app-stale' },
      draft: DRAFT,
      replaceLinkedAppId: 'app-stale',
    })
    expect(outcome.status).toBe('created')
    expect(sideEffects.createRecord).toHaveBeenCalled()
  })

  it('reports a failed linkage write without losing the created app', async () => {
    const sideEffects = ports({ writeLink: vi.fn(async () => false) })
    const outcome = await createProjectApp(sideEffects, { state: STATE, draft: DRAFT })
    expect(outcome).toMatchObject({ status: 'created', linked: false, targetCreated: true })
  })

  it('reports a failed platform target without failing the creation', async () => {
    const sideEffects = ports({ createTarget: vi.fn(async () => { throw new Error('409 conflict') }) })
    const outcome = await createProjectApp(sideEffects, { state: STATE, draft: DRAFT })
    expect(outcome).toMatchObject({ status: 'created', linked: true, targetCreated: false })
  })

  it('propagates a record failure without touching the manifest', async () => {
    const sideEffects = ports({ createRecord: vi.fn(async () => { throw new Error('slug conflict') }) })
    await expect(createProjectApp(sideEffects, { state: STATE, draft: DRAFT })).rejects.toThrow('slug conflict')
    expect(sideEffects.writeLink).not.toHaveBeenCalled()
    expect(sideEffects.createTarget).not.toHaveBeenCalled()
  })
})
