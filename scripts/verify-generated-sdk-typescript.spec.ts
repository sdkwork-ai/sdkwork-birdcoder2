import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { verifyGeneratedSdkTypescript } from './verify-generated-sdk-typescript.ts'

function writeWorkspaceHarness(root: string, workspaceMembers: string[]): void {
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    `packages:\n${workspaceMembers.map((member) => `  - "${member}"`).join('\n')}\n`,
    'utf8',
  )
}

function createSdkFixture(root: string, id: string): { sdkRoot: string; relativePrefix: string } {
  const repoName = `sdkwork-${id}`
  writeWorkspaceHarness(root, [`../${repoName}/sdks/demo-sdk/demo-sdk-typescript`])
  const sdkRoot = join(root, '..', repoName, 'sdks', 'demo-sdk', 'demo-sdk-typescript')
  return { sdkRoot, relativePrefix: `${repoName}/sdks/demo-sdk/demo-sdk-typescript` }
}

describe('verifyGeneratedSdkTypescript', () => {
  it('accepts current generator output patterns in the harness root', () => {
    const errors = verifyGeneratedSdkTypescript(join(import.meta.dirname, '..'))
    expect(errors).toEqual([])
  })

  it('rejects stale optional request field assignment in generated API files', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-verify-sdk-'))
    const { sdkRoot, relativePrefix } = createSdkFixture(root, 'stale-signal')
    mkdirSync(join(sdkRoot, 'generated', 'server-openapi', 'src', 'api'), { recursive: true })
    writeFileSync(
      join(sdkRoot, 'generated', 'server-openapi', 'src', 'api', 'demo.ts'),
      'export const stale = { signal: requestOptions?.signal }\n',
      'utf8',
    )

    expect(verifyGeneratedSdkTypescript(root)).toEqual([
      `${relativePrefix}/generated/server-openapi/src/api/demo.ts: stale generator output assigns optional request fields as \`prop: value | undefined\`; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
    ])
  })

  it('rejects stale BaseApi.request() literal undefined optional fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-verify-sdk-'))
    const { sdkRoot, relativePrefix } = createSdkFixture(root, 'stale-base')
    mkdirSync(join(sdkRoot, 'generated', 'server-openapi', 'src', 'api'), { recursive: true })
    writeFileSync(
      join(sdkRoot, 'generated', 'server-openapi', 'src', 'api', 'base.ts'),
      'export const stale = `{ method: method as any, body, params, headers, contentType }`\n',
      'utf8',
    )

    expect(verifyGeneratedSdkTypescript(root)).toEqual([
      `${relativePrefix}/generated/server-openapi/src/api/base.ts: stale BaseApi.request() passes undefined optional fields literally; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
    ])
  })

  it('rejects HttpClient missing override modifiers', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-verify-sdk-'))
    const { sdkRoot, relativePrefix } = createSdkFixture(root, 'stale-http')
    mkdirSync(join(sdkRoot, 'generated', 'server-openapi', 'src', 'http'), { recursive: true })
    writeFileSync(
      join(sdkRoot, 'generated', 'server-openapi', 'src', 'http', 'client.ts'),
      'class HttpClient {\n  protected buildHeaders() {}\n}\n',
      'utf8',
    )

    expect(verifyGeneratedSdkTypescript(root)).toEqual([
      `${relativePrefix}/generated/server-openapi/src/http/client.ts: HttpClient is missing override modifiers required under strict TypeScript; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
    ])
  })

  it('rejects client package tests that are not *.client.spec.* or *.host.spec.*', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-verify-sdk-'))
    writeWorkspaceHarness(root, [])
    mkdirSync(join(root, 'packages', 'client', 'ui-demo', 'tests'), { recursive: true })
    writeFileSync(join(root, 'packages', 'client', 'ui-demo', 'tests', 'service.spec.ts'), 'export {}\n', 'utf8')

    expect(verifyGeneratedSdkTypescript(root)).toEqual([
      'packages/client/ui-demo/tests/service.spec.ts: client package tests must use *.client.spec.* or *.host.spec.* so tsconfig.host.json does not type-check browser source through the host aggregate',
    ])
  })
})
