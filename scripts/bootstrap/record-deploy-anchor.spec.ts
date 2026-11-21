import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deployApplicationAnchorFromResponse,
  recordDeployAnchor,
  upsertDotenvValues,
} from './record-deploy-anchor.ts'

const roots: string[] = []

/** Create a throwaway repository root. */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-record-anchor-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('deployApplicationAnchorFromResponse', () => {
  it('finds the id inside the remote response envelopes', () => {
    expect(deployApplicationAnchorFromResponse({ deployApplicationId: '382429273778032640' })).toBe('382429273778032640')
    expect(deployApplicationAnchorFromResponse({ data: { provision: { deploy_app_id: ' 42 ' } } })).toBe('42')
    expect(deployApplicationAnchorFromResponse({ result: [{ deployAppId: '7' }] })).toBe('7')
    expect(deployApplicationAnchorFromResponse({ data: { deploy_application_id: '9' } })).toBe('9')
  })

  it('ignores a manifest appId and an empty response', () => {
    expect(deployApplicationAnchorFromResponse({ appId: 'sdkwork-birdcoder2-web-app' })).toBe('')
    expect(deployApplicationAnchorFromResponse({ deployApplicationId: '   ' })).toBe('')
    expect(deployApplicationAnchorFromResponse(null)).toBe('')
    expect(deployApplicationAnchorFromResponse('3824')).toBe('')
  })
})

describe('upsertDotenvValues', () => {
  it('replaces an existing value in place and appends a missing one', () => {
    expect(upsertDotenvValues('A=1\nB=2\n', { B: '3', C: '4' })).toBe('A=1\nB=3\nC=4\n')
  })

  it('keeps comments and line endings', () => {
    expect(upsertDotenvValues('# keep\r\nA=1\r\n', { A: '2' })).toBe('# keep\r\nA=2\r\n')
    expect(upsertDotenvValues('', { A: '1' })).toBe('A=1\n')
  })

  it('keeps the first position when a variable appears twice', () => {
    expect(upsertDotenvValues('A=1\nA=2\n', { A: '3' })).toBe('A=3\nA=2\n')
  })
})

describe('recordDeployAnchor', () => {
  it('records the repository-root surface in the repository .env layer', () => {
    const root = repository()
    const [write] = recordDeployAnchor({ repoRoot: root, appId: '382418217538162688' })
    expect(write).toMatchObject({ file: join(root, '.env'), variables: ['SDKWORK_DEPLOY_APPLICATION_ID'], changed: true })
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('SDKWORK_DEPLOY_APPLICATION_ID=382418217538162688\n')
  })

  it('records a surface in its scoped variable and in its own .env.local', () => {
    const root = repository()
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    writeFileSync(join(root, '.env'), 'SDKWORK_DEPLOY_APPLICATION_ID=382418217538162688\n', 'utf8')
    writeFileSync(join(root, 'apps', 'web', '.env.local'), '# local layer\nSDKWORK_DEPLOY_APPLICATION_ID=stale\n', 'utf8')

    const writes = recordDeployAnchor({
      repoRoot: root,
      appId: '382429273778032640',
      surfaceRoot: join('apps', 'web'),
      surfaceId: 'sdkwork-birdcoder2-web-app',
    })

    expect(writes.map(write => write.variables.join(','))).toEqual([
      'SDKWORK_DEPLOY_APPLICATION_ID_SDKWORK_BIRDCODER2_WEB_APP',
      'SDKWORK_DEPLOY_APPLICATION_ID',
    ])
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe(
      'SDKWORK_DEPLOY_APPLICATION_ID=382418217538162688\n'
      + 'SDKWORK_DEPLOY_APPLICATION_ID_SDKWORK_BIRDCODER2_WEB_APP=382429273778032640\n',
    )
    expect(readFileSync(join(root, 'apps', 'web', '.env.local'), 'utf8')).toBe(
      '# local layer\nSDKWORK_DEPLOY_APPLICATION_ID=382429273778032640\n',
    )
  })

  it('is idempotent and creates a missing layer', () => {
    const root = repository()
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    const options = {
      repoRoot: root,
      appId: '382429273778032640',
      surfaceRoot: join('apps', 'web'),
      surfaceId: 'sdkwork-birdcoder2-web-app',
    }
    recordDeployAnchor(options)
    const second = recordDeployAnchor(options)
    expect(second.map(write => write.changed)).toEqual([false, false])
    expect(existsSync(join(root, 'apps', 'web', '.env.local'))).toBe(true)
  })

  it('reports without writing when asked to dry run', () => {
    const root = repository()
    const [write] = recordDeployAnchor({ repoRoot: root, appId: '382418217538162688', dryRun: true })
    expect(write?.changed).toBe(true)
    expect(existsSync(join(root, '.env'))).toBe(false)
  })

  it('rejects a value that is not a deploy application id', () => {
    const root = repository()
    expect(() => recordDeployAnchor({ repoRoot: root, appId: '' })).toThrow(/id is required/u)
    expect(() => recordDeployAnchor({ repoRoot: root, appId: '__SDKWORK_DEPLOY_APPLICATION_ID__' })).toThrow(/placeholder/u)
    expect(() => recordDeployAnchor({ repoRoot: root, appId: 'a\nb' })).toThrow(/not a deploy application id/u)
    expect(() => recordDeployAnchor({ repoRoot: root, appId: '${SDKWORK_DEPLOY_APPLICATION_ID}' })).toThrow(/not a deploy application id/u)
  })

  it('rejects a surface outside the repository or without a surface id', () => {
    const root = repository()
    expect(() => recordDeployAnchor({ repoRoot: root, appId: '1', surfaceRoot: resolve(root, '..', 'elsewhere'), surfaceId: 'x' }))
      .toThrow(/outside/u)
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    expect(() => recordDeployAnchor({ repoRoot: root, appId: '1', surfaceRoot: join('apps', 'web') }))
      .toThrow(/--surface-id/u)
  })
})
