import { expect, it, vi } from 'vitest'
import {
  ModelPriceGroupService,
  pinnedGroupOf,
  vendorCodeOf,
  type PriceGroupApi,
  type PriceGroupOption,
} from '../src/client/model-price-groups.ts'

function api(overrides: Partial<PriceGroupApi> = {}): PriceGroupApi {
  return {
    listGroups: vi.fn(async () => [
      { code: 'cheap', name: 'Cheap pool', isDefault: true, selected: true },
      { code: 'premium', name: 'Premium pool', isDefault: false, selected: false },
    ]),
    listDefaults: vi.fn(async () => []),
    saveDefault: vi.fn(async () => {}),
    ...overrides,
  }
}

const env = { apiBaseUrl: () => 'https://api.birdcoder.com', accessToken: () => '' }
const iam = { controller: { getState: () => ({ session: { authToken: 'a', accessToken: 'b' } }) } }

it('derives the vendor segment and the explicit model rule', () => {
  expect(vendorCodeOf('deepseek/deepseek-flash')).toBe('deepseek')
  expect(vendorCodeOf('standalone')).toBe('')
  expect(vendorCodeOf('/leading')).toBe('')
  expect(pinnedGroupOf([
    { scope: 'vendor' as const, vendorCode: 'deepseek', model: '', modality: 'text', accountGroupCode: 'vendor-pool', accountGroupId: '1', accountGroupName: 'V', priority: 0 },
    { scope: 'model' as const, vendorCode: '', model: 'deepseek/deepseek-flash', modality: 'text', accountGroupCode: 'cheap', accountGroupId: '2', accountGroupName: 'C', priority: 0 },
  ], 'deepseek/deepseek-flash')).toBe('cheap')
  expect(pinnedGroupOf([], 'deepseek/deepseek-flash')).toBeNull()
})

it('loads the groups and the user rule once per model', async () => {
  const transport = api()
  const service = new ModelPriceGroupService({ env, iam, createApi: () => transport })
  const state = await service.ensure('deepseek/deepseek-flash')
  expect(transport.listGroups).toHaveBeenCalledWith('deepseek/deepseek-flash')
  expect(state).toMatchObject({
    status: 'ready',
    model: 'deepseek/deepseek-flash',
    pinned: null,
    saving: false,
    groups: [
      { code: 'cheap', name: 'Cheap pool', isDefault: true, selected: true },
      { code: 'premium', name: 'Premium pool', isDefault: false, selected: false },
    ],
  })
  await service.ensure('deepseek/deepseek-flash')
  expect(transport.listGroups).toHaveBeenCalledTimes(1)
})

it('reports the stored model rule as the pinned group', async () => {
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({
      listDefaults: async () => [
        { scope: 'model' as const, vendorCode: '', model: 'deepseek/deepseek-flash', modality: 'text', accountGroupCode: 'premium', accountGroupId: '2', accountGroupName: 'Premium pool', priority: 0 },
      ],
    }),
  })
  expect(await service.ensure('deepseek/deepseek-flash')).toMatchObject({ pinned: 'premium' })
})

it('pins one group with the vendor segment and clears with an empty list', async () => {
  const ids: { model: string; vendorCode: string; accountGroups: readonly string[] }[] = []
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({
      saveDefault: async (input) => { ids.push(input) },
    }),
  })
  await service.select('deepseek/deepseek-flash', 'premium')
  expect(ids[0]).toEqual({ model: 'deepseek/deepseek-flash', vendorCode: 'deepseek', accountGroups: ['premium'] })
  await service.select('deepseek/deepseek-flash', null)
  expect(ids[1]).toEqual({ model: 'deepseek/deepseek-flash', vendorCode: 'deepseek', accountGroups: [] })
  expect(service.state.getSnapshot().saving).toBe(false)
})

it('clears the saving flag and keeps the failure on a rejected write', async () => {
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({
      saveDefault: async () => { throw new Error('group is not available to this user') },
      listDefaults: async () => [],
    }),
  })
  await expect(service.select('deepseek/deepseek-flash', 'premium')).rejects.toThrow('group is not available to this user')
  expect(service.state.getSnapshot()).toMatchObject({ saving: false, error: 'group is not available to this user' })
})

it('drops the result of a superseded model load', async () => {
  const first = Promise.withResolvers<readonly PriceGroupOption[]>()
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({
      listGroups: model => model === 'old/model' ? first.promise : Promise.resolve([
        { code: 'new', name: 'New pool', isDefault: false, selected: true },
      ]),
    }),
  })
  const oldLoad = service.ensure('old/model')
  await service.ensure('new/model')
  first.resolve([{ code: 'old', name: 'Old pool', isDefault: true, selected: true }])
  await oldLoad
  expect(service.state.getSnapshot()).toMatchObject({ model: 'new/model', status: 'ready', pinned: null })
  expect(service.state.getSnapshot().groups.map(group => group.code)).toEqual(['new'])
})

it('surfaces a failed read and retries it', async () => {
  let calls = 0
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({
      listGroups: async () => {
        calls += 1
        if (calls === 1) throw new Error('offline')
        return [{ code: 'cheap', name: 'Cheap pool', isDefault: true, selected: true }]
      },
    }),
  })
  expect(await service.ensure('deepseek/deepseek-flash')).toMatchObject({ status: 'failed', error: 'offline' })
  expect(await service.refresh('deepseek/deepseek-flash')).toMatchObject({ status: 'ready' })
})

it('refuses work after disposal and ignores late results', async () => {
  const pending = Promise.withResolvers<never[]>()
  const service = new ModelPriceGroupService({
    env,
    iam,
    createApi: () => api({ listGroups: async () => pending.promise }),
  })
  const load = service.ensure('deepseek/deepseek-flash')
  service.dispose()
  pending.resolve([])
  await expect(load).resolves.toMatchObject({ model: 'deepseek/deepseek-flash' })
  expect(await service.ensure('deepseek/deepseek-flash')).toBeUndefined()
  await expect(service.select('deepseek/deepseek-flash', null)).rejects.toThrow('disposed')
})
