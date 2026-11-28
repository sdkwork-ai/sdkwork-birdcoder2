import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { lanePortInUseError, probeLoopbackPort } from '../scripts/development-ports.ts'

describe('lanePortInUseError', () => {
  it('names the lane, the port, and why the launch must not continue', () => {
    const error = lanePortInUseError('online', 19389)
    expect(error.message).toMatch(/online lane web port 19389 is already in use by a process this launch does not own/u)
    expect(error.message).toMatch(/attaches to the older Host/u)
  })

  it('reports the development lane separately', () => {
    expect(lanePortInUseError('development', 19388).message).toMatch(/development lane web port 19388/u)
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
