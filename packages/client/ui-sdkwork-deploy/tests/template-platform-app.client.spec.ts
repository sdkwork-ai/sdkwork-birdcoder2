/** The platform-app recorder over a generated-client stub. */
import { describe, expect, it } from 'vitest'
import type { SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { createPlatformAppRecorder } from '../src/client/templatePlatformApp.ts'

describe('createPlatformAppRecorder', () => {
  it('registers one account-owned app and its console-card target', async () => {
    const created: unknown[] = []
    const targets: unknown[] = []
    const deployClient = {
      app: {
        create: async (body: Record<string, unknown>) => {
          created.push(body)
          return { id: 'app-1', name: body.name, slug: 'sdkwork-demo-h5', appKind: body.appKind }
        },
        platformTargets: {
          create: async (appId: string, body: Record<string, unknown>) => {
            targets.push({ appId, body })
            return { id: 'target-1' }
          },
        },
      },
    } as unknown as SdkworkDeployAppClient
    const recorder = createPlatformAppRecorder(deployClient, {} as SdkworkDriveAppClient)
    const app = await recorder.create({
      name: '演示 H5',
      slug: 'sdkwork-demo-h5',
      appKind: 'SPA_WEB',
      description: 'Mobile web app',
    })
    expect(app).toEqual({ id: 'app-1', name: '演示 H5', slug: 'sdkwork-demo-h5', appKind: 'SPA_WEB' })
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      name: '演示 H5',
      slug: 'sdkwork-demo-h5',
      appKind: 'SPA_WEB',
      description: 'Mobile web app',
    })
    await recorder.createTarget('app-1', 'h5')
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ appId: 'app-1', body: { targetKey: 'h5' } })
  })

  it('omits an absent description from the create payload', async () => {
    const created: unknown[] = []
    const deployClient = {
      app: {
        create: async (body: Record<string, unknown>) => {
          created.push(body)
          return { id: 'app-1', name: body.name, slug: body.slug, appKind: body.appKind }
        },
        platformTargets: { create: async () => ({ id: 'target-1' }) },
      },
    } as unknown as SdkworkDeployAppClient
    const recorder = createPlatformAppRecorder(deployClient, {} as SdkworkDriveAppClient)
    await recorder.create({ name: 'Demo', slug: 'demo', appKind: 'STATIC_WEB' })
    expect(created[0]).not.toHaveProperty('description')
  })
})
