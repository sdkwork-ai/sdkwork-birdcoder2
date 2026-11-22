/**
 * Transport integration over a real HTTP server: the generated CloudRouter app
 * client must build the `/app/v3/api` URLs, carry the IAM session's auth and
 * access tokens, unwrap the `data.item` envelope, and send the documented
 * camelCase write body. The fake server answers exactly like the Rust handlers.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it, onTestFinished } from 'vitest'
import {
  ModelPriceGroupService,
  createCloudRouterPriceGroupApi,
  type PriceGroupEnvironment,
  type PriceGroupIam,
} from '../src/client/model-price-groups.ts'

const MODEL = 'deepseek/deepseek-flash'

interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

interface GroupRow {
  groupCode: string
  groupId: string
  groupName: string
  isDefault: boolean
  selected: boolean
}

/**
 * A CloudRouter app-api double: the three model-group operations plus a
 * problem+json 404 for an unknown model.
 * @returns the origin, recorded requests, and the current group/default rows.
 */
async function fakeCloudRouter() {
  const requests: RecordedRequest[] = []
  let groups: GroupRow[] = [
    { groupCode: 'cheap', groupId: '1', groupName: 'Cheap pool', isDefault: true, selected: true },
    { groupCode: 'premium', groupId: '2', groupName: 'Premium pool', isDefault: false, selected: false },
  ]
  let defaults: readonly Record<string, unknown>[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers, body })
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const send = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
      }
      if (request.method === 'GET' && url.pathname === '/app/v3/api/ai/routing/model_groups') {
        const model = url.searchParams.get('model') ?? ''
        if (model === 'unknown/model') {
          send(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: 'model not found' })
          return
        }
        send(200, { code: 0, data: { item: { model, groups } }, traceId: 'trace-1' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/app/v3/api/ai/routing/model_group_defaults') {
        send(200, { code: 0, data: { item: { defaults } }, traceId: 'trace-2' })
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith('/v1/models/') && url.pathname.endsWith('/groups')) {
        const model = decodeURIComponent(url.pathname.slice('/v1/models/'.length, -'/groups'.length))
        if (model === 'unknown/model') {
          send(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: 'model not found' })
          return
        }
        send(200, {
          object: 'list',
          data: groups.map(group => ({
            id: group.groupId,
            code: group.groupCode,
            name: group.groupName,
            defaultForModel: group.selected,
          })),
        })
        return
      }
      if (request.method === 'PUT' && url.pathname === '/app/v3/api/ai/routing/model_group_defaults') {
        const parsed = JSON.parse(body) as {
          scope?: string
          model?: string
          vendorCode?: string
          accountGroups?: string[]
        }
        const chosen = parsed.accountGroups?.[0]
        groups = groups.map(group => ({ ...group, selected: chosen !== undefined && group.groupCode === chosen }))
        defaults = chosen === undefined ? [] : [{
          scope: parsed.scope,
          modality: 'text',
          vendorCode: parsed.vendorCode,
          model: parsed.model,
          accountGroupId: '2',
          accountGroupCode: chosen,
          accountGroupName: 'Premium pool',
          priority: 0,
        }]
        send(200, { code: 0, data: { accepted: true }, traceId: 'trace-3' })
        return
      }
      send(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: 'no such operation' })
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  onTestFinished(() => {
    server.closeAllConnections()
    server.close()
  })
  return { origin: `http://127.0.0.1:${port}`, requests, groups: () => groups, defaults: () => defaults }
}

function environment(origin: string): PriceGroupEnvironment {
  return { apiBaseUrl: () => origin, accessToken: () => '' }
}

function iam(): PriceGroupIam {
  return {
    controller: {
      getState: () => ({ session: { authToken: 'auth-token-value', accessToken: 'access-token-value' } }),
    },
  }
}

it('calls the documented app-api operations with the IAM credentials', async () => {
  const cloud = await fakeCloudRouter()
  const api = createCloudRouterPriceGroupApi(environment(cloud.origin), iam())

  const groups = await api.listGroups(MODEL)
  expect(groups.map(group => group.code)).toEqual(['cheap', 'premium'])
  expect(await api.listDefaults()).toEqual([])

  await api.saveDefault({ model: MODEL, vendorCode: 'deepseek', accountGroups: ['premium'] })

  const [list, defaults, write] = cloud.requests
  expect(list.method).toBe('GET')
  // The generated client percent-encodes the vendor slash into one path segment,
  // which is what the server route expects.
  expect(list.url).toContain('deepseek%2Fdeepseek-flash')
  expect(decodeURIComponent(list.url)).toBe(`/v1/models/${MODEL}/groups`)
  expect(list.headers.authorization).toBe('Bearer auth-token-value')
  expect(list.headers['access-token']).toBe('access-token-value')
  expect(defaults.url).toBe('/app/v3/api/ai/routing/model_group_defaults')
  expect(write.method).toBe('PUT')
  expect(write.url).toBe('/app/v3/api/ai/routing/model_group_defaults')
  expect(JSON.parse(write.body)).toEqual({
    scope: 'model',
    model: MODEL,
    vendorCode: 'deepseek',
    accountGroups: ['premium'],
  })
  expect(write.headers.authorization).toBe('Bearer auth-token-value')
  expect(write.headers['access-token']).toBe('access-token-value')
})

it('persists the picker choice through the generated SDK', async () => {
  const cloud = await fakeCloudRouter()
  const service = new ModelPriceGroupService({ env: environment(cloud.origin), iam: iam() })

  expect(await service.ensure(MODEL)).toMatchObject({ status: 'ready', model: MODEL, pinned: null })
  await service.select(MODEL, 'premium')

  const state = service.state.getSnapshot()
  expect(state.pinned).toBe('premium')
  expect(state.groups.find(group => group.code === 'premium')?.selected).toBe(true)
  expect(state.groups.find(group => group.code === 'cheap')?.selected).toBe(false)
  expect(cloud.defaults()).toEqual([expect.objectContaining({ scope: 'model', accountGroupCode: 'premium' })])

  await service.select(MODEL, null)
  const writes = cloud.requests.filter(request => request.method === 'PUT')
  expect(JSON.parse(writes.at(-1)!.body)).toEqual({ scope: 'model', model: MODEL, vendorCode: 'deepseek', accountGroups: [] })
  expect(service.state.getSnapshot().pinned).toBeNull()
})

it('reports an unknown model from the server as a failed read', async () => {
  const cloud = await fakeCloudRouter()
  const service = new ModelPriceGroupService({ env: environment(cloud.origin), iam: iam() })
  const state = await service.ensure('unknown/model')
  expect(state).toMatchObject({ status: 'failed', model: 'unknown/model', groups: [] })
  expect(state?.error).toBeTruthy()
})
