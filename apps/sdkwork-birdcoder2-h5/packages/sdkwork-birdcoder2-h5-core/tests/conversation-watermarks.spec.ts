import { describe, expect, it } from 'vitest'

import {
  BIRDCODER2_H5_WATERMARK_KEY,
  clearConversationWatermark,
  readConversationWatermark,
  readConversationWatermarks,
  writeConversationWatermark,
  type SecureStorageHostAdapter,
} from '../src/index'

function memoryStorage(seed?: Record<string, string>): SecureStorageHostAdapter & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    entries,
    read: key => Promise.resolve(entries.get(key)),
    write: (key, value) => {
      entries.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      entries.delete(key)
      return Promise.resolve()
    },
  }
}

describe('conversation watermarks', () => {
  it('round-trips a resume point', async () => {
    const storage = memoryStorage()
    await writeConversationWatermark('s-1', '42', storage, 1_700_000_000_000)
    expect(await readConversationWatermark('s-1', storage)).toBe('42')
    expect(await readConversationWatermarks(storage)).toEqual({
      's-1': { sequence: '42', recordedAt: 1_700_000_000_000 },
    })
  })

  it('keeps a sequence as a string, so an int64 is not truncated', async () => {
    const storage = memoryStorage()
    const huge = '9223372036854775807'
    await writeConversationWatermark('s-1', huge, storage, 1)
    expect(await readConversationWatermark('s-1', storage)).toBe(huge)
  })

  it('keeps the resume point of one conversation when another is written', async () => {
    const storage = memoryStorage()
    await writeConversationWatermark('s-1', '1', storage, 1)
    await writeConversationWatermark('s-2', '2', storage, 2)
    expect(await readConversationWatermark('s-1', storage)).toBe('1')
    expect(await readConversationWatermark('s-2', storage)).toBe('2')
  })

  it('moves one conversation forward without disturbing the others', async () => {
    const storage = memoryStorage()
    await writeConversationWatermark('s-1', '1', storage, 1)
    await writeConversationWatermark('s-2', '2', storage, 2)
    await writeConversationWatermark('s-1', '9', storage, 3)
    expect(await readConversationWatermark('s-1', storage)).toBe('9')
    expect(await readConversationWatermark('s-2', storage)).toBe('2')
  })

  it('clears one conversation only', async () => {
    const storage = memoryStorage()
    await writeConversationWatermark('s-1', '1', storage, 1)
    await writeConversationWatermark('s-2', '2', storage, 2)
    await clearConversationWatermark('s-1', storage)
    expect(await readConversationWatermark('s-1', storage)).toBeUndefined()
    expect(await readConversationWatermark('s-2', storage)).toBe('2')
  })

  it('is a no-op clearing an unknown conversation', async () => {
    const storage = memoryStorage()
    await clearConversationWatermark('missing', storage)
    expect(storage.entries.has(BIRDCODER2_H5_WATERMARK_KEY)).toBe(false)
  })

  it('reports no resume point before the first write', async () => {
    expect(await readConversationWatermark('s-1', memoryStorage())).toBeUndefined()
  })

  it('survives a truncated blob by falling back to an empty map', async () => {
    const storage = memoryStorage({ [BIRDCODER2_H5_WATERMARK_KEY]: '{"s-1":{"sequence":"4"' })
    expect(await readConversationWatermarks(storage)).toEqual({})
  })

  it('drops malformed entries instead of throwing', async () => {
    const storage = memoryStorage({
      [BIRDCODER2_H5_WATERMARK_KEY]: JSON.stringify({
        's-1': { sequence: '4', recordedAt: 1 },
        's-2': { sequence: 4, recordedAt: 1 },
        's-3': 'not-an-object',
        's-4': { sequence: '5' },
      }),
    })
    expect(await readConversationWatermarks(storage)).toEqual({
      's-1': { sequence: '4', recordedAt: 1 },
    })
  })

  it('ignores a JSON array or scalar where the map should be', async () => {
    expect(await readConversationWatermarks(memoryStorage({ [BIRDCODER2_H5_WATERMARK_KEY]: '[1,2]' }))).toEqual({})
    expect(await readConversationWatermarks(memoryStorage({ [BIRDCODER2_H5_WATERMARK_KEY]: '7' }))).toEqual({})
  })
})
