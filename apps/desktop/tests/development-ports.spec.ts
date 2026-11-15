import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { assertDevelopmentLanePortFree, probeLoopbackPort } from '../scripts/development-ports.ts'

describe('assertDevelopmentLanePortFree', () => {
  it('accepts a free lane port', async () => {
    await expect(assertDevelopmentLanePortFree({
      lane: 'online',
      port: 19389,
      probe: async () => false,
    })).resolves.toBeUndefined()
  })

  it('names the lane, the port and the stale-Host symptom', async () => {
    await expect(assertDevelopmentLanePortFree({
      lane: 'online',
      port: 19389,
      probe: async () => true,
    })).rejects.toThrow(/online lane web port 19389 is already in use.*attaches to the older Host/u)
  })

  it('reports the development lane separately', async () => {
    await expect(assertDevelopmentLanePortFree({
      lane: 'development',
      port: 19388,
      probe: async () => true,
    })).rejects.toThrow(/development lane web port 19388/u)
  })
})

describe('probeLoopbackPort', () => {
  it('detects a served loopback port and a released one', async () => {
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => { resolve() })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      throw new Error('test server has no TCP address')
    }
    try {
      await expect(probeLoopbackPort(address.port)).resolves.toBe(true)
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
    await expect(probeLoopbackPort(address.port)).resolves.toBe(false)
  })
})
