// @vitest-environment node
/** Use-template install against a REAL generated SDK stack: a local stub
 * gateway serves the deployments/drive app-api envelopes over HTTP, the real
 * generated clients dispatch against it, and the install chain lands the
 * expanded template on real disk. This closes the authenticated-chain gap the
 * signed-out smoke could not reach (envelope parsing, Access-Token dispatch,
 * chunked Drive reads, checksummed archive bytes). */
import http from 'node:http'
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { createClient as createDeployClient, type SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import { createClient as createDriveClient, type SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { getSdkworkGlobalTokenManager, resetSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { installTemplateVersion, type TemplateInstallWritePort } from '../src/client/installTemplate.ts'

const ACCESS_TOKEN = 'e2e-static-token'
const ARCHIVE = zipSync({
  'src/main.ts': strToU8('export const app = "模板";\n'),
  'assets/logo.bin': new Uint8Array([0x00, 0x89, 0x50]),
})

/** The stub gateway: deployments + drive envelopes over one HTTP server. */
async function startGateway(): Promise<{
  url: string
  accessTokenSeen: string[]
  close: () => Promise<void>
}> {
  const accessTokenSeen: string[] = []
  const json = (res: http.ServerResponse, data: unknown): void => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  const server = http.createServer((req, res) => {
    const token = req.headers['access-token']
    if (typeof token === 'string') accessTokenSeen.push(token)
    const url = (req.url ?? '').split('?')[0]
    if (url === '/app/v3/api/app_templates/tpl-1') {
      json(res, { code: 0, data: { id: 'tpl-1', displayName: 'PC 管理台模板', templateKey: 'pc-admin', version: '0.2.0', latestVersionUuid: 'v-2' } })
      return
    }
    if (url === '/app/v3/api/app_templates/tpl-1/versions') {
      json(res, { code: 0, data: { items: [
        { id: 'v-1', version: '0.1.0' },
        { id: 'v-2', version: '0.2.0', artifactUuid: 'art-1' },
      ], pageInfo: {} } })
      return
    }
    if (url === '/app/v3/api/artifacts/art-1') {
      json(res, { code: 0, data: { id: 'art-1', driveNodeId: 'node-1' } })
      return
    }
    if (url === '/app/v3/api/drive/nodes/node-1/content') {
      json(res, { code: 0, data: {
        content: Buffer.from(ARCHIVE).toString('base64'),
        sizeBytes: String(ARCHIVE.length),
        hasMore: false,
      } })
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 404, message: `unrouted ${url}` }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway listen failed')
  return {
    url: `http://127.0.0.1:${address.port}`,
    accessTokenSeen,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

let gateway: Awaited<ReturnType<typeof startGateway>>
let workspace: string

beforeAll(async () => {
  gateway = await startGateway()
  workspace = await mkdtemp(join(tmpdir(), 'template-install-e2e-'))
  getSdkworkGlobalTokenManager().setTokens({ accessToken: ACCESS_TOKEN })
})

afterAll(async () => {
  await gateway.close()
  await rm(workspace, { recursive: true, force: true })
  resetSdkworkGlobalTokenManager()
})

/** Real generated clients over the stub gateway, the way deployHost builds them. */
function buildClients(): { deployClient: SdkworkDeployAppClient; driveClient: SdkworkDriveAppClient } {
  const common = {
    authMode: 'dual-token' as const,
    platform: 'pc' as const,
    baseUrl: gateway.url,
    tokenManager: getSdkworkGlobalTokenManager(),
  }
  return {
    deployClient: createDeployClient(common),
    driveClient: createDriveClient(common),
  }
}

/** A write port that lands files on real disk under the target directory. */
function diskWritePort(targetDirectory: string): TemplateInstallWritePort {
  return {
    async writeFile(request) {
      const absolutePath = join(targetDirectory, request.relativePath)
      const bytes = Buffer.from(request.contentBase64, 'base64')
      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, bytes)
      return { absolutePath, bytes: bytes.length }
    },
  }
}

describe('installTemplateVersion over a real SDK HTTP stack', () => {
  /** One fresh target directory per case, so assertions never share state. */
  async function freshTarget(name: string): Promise<string> {
    return mkdtemp(join(workspace, `${name}-`))
  }

  it('resolves the latest artifact version, downloads through Drive, and lands the files on disk', async () => {
    const { deployClient, driveClient } = buildClients()
    const targetDirectory = await freshTarget('full')
    const report = vi.fn()
    const outcome = await installTemplateVersion({
      templates: deployClient.template,
      artifacts: deployClient,
      drive: driveClient,
      writeFile: diskWritePort(targetDirectory).writeFile,
      reportProgress: report,
    }, { templateId: 'tpl-1', targetDirectory })

    expect(outcome).toMatchObject({
      templateName: 'PC 管理台模板',
      templateKey: 'pc-admin',
      version: '0.2.0',
      fileCount: 2,
      textCount: 1,
      binaryCount: 1,
    })
    // Real bytes on real disk, through base64 wire encoding and back.
    expect(await readFile(join(targetDirectory, 'src/main.ts'), 'utf8')).toBe('export const app = "模板";\n')
    const logo = await readFile(join(targetDirectory, 'assets/logo.bin'))
    expect([...logo]).toEqual([0x00, 0x89, 0x50])
    // Progress covered both stages.
    expect(report).toHaveBeenCalledWith({ kind: 'download', percent: 100 })
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'write', index: 2, total: 2 }))
  }, 30000)

  it('dispatches every request with the Access-Token header', async () => {
    const { deployClient, driveClient } = buildClients()
    const targetDirectory = await freshTarget('auth')
    await installTemplateVersion({
      templates: deployClient.template,
      artifacts: deployClient,
      drive: driveClient,
      writeFile: diskWritePort(targetDirectory).writeFile,
    }, { templateId: 'tpl-1', targetDirectory })
    expect(gateway.accessTokenSeen.length).toBeGreaterThan(0)
    expect(gateway.accessTokenSeen.every(token => token === ACCESS_TOKEN)).toBe(true)
  }, 30000)

  it('prefers the template\'s latest artifact version over older rows', async () => {
    const { deployClient, driveClient } = buildClients()
    const seenArtifactIds: string[] = []
    const targetDirectory = await freshTarget('latest')
    const outcome = await installTemplateVersion({
      templates: deployClient.template,
      artifacts: {
        artifact: {
          retrieve: async (artifactId: string) => {
            seenArtifactIds.push(artifactId)
            return deployClient.artifact.retrieve(artifactId)
          },
        },
      },
      drive: driveClient,
      writeFile: diskWritePort(targetDirectory).writeFile,
    }, { templateId: 'tpl-1', targetDirectory })
    expect(seenArtifactIds).toEqual(['art-1'])
    expect(outcome.version).toBe('0.2.0')
  }, 30000)
})
