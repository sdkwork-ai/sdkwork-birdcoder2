/** The OEM plugin publishes `ctx.oem` synchronously and keeps the index injection disposable. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { OEM_BOOT_GLOBAL } from '../src/config.ts'
import { apply, Config, name } from '../src/index.ts'

const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]
const contexts: Context[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function profile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-oem-plugin-'))
  directories.push(directory)
  const filename = join(directory, 'oem.json')
  await writeFile(filename, content)
  return filename
}

async function mount(configFile: string | undefined, environment?: 'development' | 'testing' | 'staging' | 'production'): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name, apply, Config }, {
    ...(configFile === undefined ? {} : { configFile }),
    ...(environment === undefined ? {} : { environment }),
  }).await()
  return ctx
}

describe('sdkwork-oem plugin', () => {
  it('follows the configured lifecycle when no profile names origins', async () => {
    const ctx = await mount(undefined, 'development')
    expect(ctx.oem.environment).toBe('development')
    expect(ctx.oem.deepseek.platformOrigin).toBe('http://platform-dev.birdcoder.com')
    expect(ctx.oem.deepseek.inferenceOrigin).toBe('http://api-dev.birdcoder.com')
    expect(ctx.oem.deepseek.allowInsecureHttp).toBe(true)
    expect(ctx.oem.sdkwork.iamAuthorizeBaseUrl).toBe('http://platform-dev.birdcoder.com')
  })
  it('publishes the resolved profile through ctx.oem', async () => {
    const configFile = await profile(JSON.stringify({
      brand: { name: 'Acme Coder', companyName: 'Acme' },
      deepseek: { platformOrigin: 'https://platform.acme.test', inferenceOrigin: 'https://gateway.acme.test' },
    }))
    const ctx = await mount(configFile)
    expect(ctx.oem.brand).toEqual({ name: 'Acme Coder', companyName: 'Acme' })
    expect(ctx.oem.application.origins).toEqual(['https://birdcoder.com'])
    expect(ctx.oem.sdkwork.iamBaseUrl).toBe('https://api.birdcoder.com')
    expect(ctx.oem.sdkwork.iamAuthorizeBaseUrl).toBe('https://platform.birdcoder.com')
    expect(ctx.oem.deepseek.messagesBaseUrl).toBe('https://gateway.acme.test/anthropic')
  })

  it('publishes the browser projection and withdraws it on disposal', async () => {
    const configFile = await profile(JSON.stringify({ brand: { name: 'Acme' } }))
    const ctx = await mount(configFile)
    const table: IndexInjection[] = []
    ctx.emit('webserver/index-inject', table, PAGE_PEER)
    expect(table).toEqual([{
      kind: 'global',
      name: OEM_BOOT_GLOBAL,
      value: {
        environment: 'production',
        brand: { name: 'Acme', companyName: 'SDKWork' },
        sdkwork: {
          iamBaseUrl: 'https://api.birdcoder.com',
          iamAuthorizeBaseUrl: 'https://platform.birdcoder.com',
          iamClientId: 'birdcoder',
          iamRedirectUri: 'birdcoder://auth/callback',
        },
      },
    }])
    await ctx.fiber.dispose()
    const after: IndexInjection[] = []
    ctx.emit('webserver/index-inject', after, PAGE_PEER)
    expect(after).toEqual([])
  })

  it('keeps the shipped defaults when the profile file is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-oem-plugin-'))
    directories.push(directory)
    const ctx = await mount(join(directory, 'missing.json'))
    expect(ctx.oem.brand.name).toBe('BirdCoder')
    expect(ctx.oem.sdkwork.iamBaseUrl).toBe('https://api.birdcoder.com')
    expect(ctx.oem.sdkwork.iamAuthorizeBaseUrl).toBe('https://platform.birdcoder.com')
    expect(ctx.oem.deepseek.platformOrigin).toBe('https://platform.birdcoder.com')
    expect(ctx.oem.deepseek.inferenceOrigin).toBe('https://api.birdcoder.com')
  })
})
