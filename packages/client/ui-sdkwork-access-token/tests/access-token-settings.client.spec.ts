/**
 * Shared contract spec: project identity keys, remembered-login lookup and
 * upsert, the projection document, and the page-global path decode.
 */
import { describe, expect, it } from 'vitest'
import {
  ACCESS_TOKEN_CONFIG_FILE_KIND, ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION,
  ACCOUNTS_FIELD, decodeAccessTokenConfigPath, findAccessTokenAccount, projectAccessTokenConfigDocument,
  projectKeyOf, serializeAccessTokenConfigDocument, upsertAccessTokenAccount,
  type SdkworkAccessTokenAccount,
} from '../src/access-token-settings.ts'

/** One remembered row. */
function account(project: string, username = 'admin'): SdkworkAccessTokenAccount {
  return {
    project,
    username,
    password: 'secret',
    baseUrl: 'https://api.test',
    bootstrapAccessToken: 'bootstrap',
    environment: 'development',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('projectKeyOf', () => {
  it('normalizes Windows separators and case but keeps POSIX case', () => {
    expect(projectKeyOf('C:\\Work\\SDKwork-Im\\')).toBe('c:/work/sdkwork-im')
    expect(projectKeyOf('C:/work/sdkwork-im')).toBe('c:/work/sdkwork-im')
    expect(projectKeyOf('/work/SDKWork-Im')).toBe('/work/SDKWork-Im')
  })
})

describe('findAccessTokenAccount', () => {
  it('matches either separator form and ignores absence', () => {
    const rows = [account('C:\\work\\sdkwork-im')]
    expect(findAccessTokenAccount(rows, 'c:/WORK/sdkwork-im')).toBe(rows[0])
    expect(findAccessTokenAccount(rows, '/work/other')).toBeUndefined()
  })
})

describe('upsertAccessTokenAccount', () => {
  it('reports unchanged for identical facts and writes a changed row', () => {
    const rows = [account('/repo')]
    expect(upsertAccessTokenAccount(rows, { ...account('/repo'), updatedAt: 'later' }))
      .toEqual({ accounts: rows, status: 'unchanged' })
    const changed = upsertAccessTokenAccount(rows, account('/repo', 'operator'))
    expect(changed.status).toBe('written')
    expect(changed.accounts[0]?.username).toBe('operator')
    expect(rows[0]?.username).toBe('admin')
  })

  it('appends a project that has no row yet', () => {
    const result = upsertAccessTokenAccount([account('/a')], account('/b'))
    expect(result.status).toBe('written')
    expect(result.accounts.map(row => row.project)).toEqual(['/a', '/b'])
  })
})

describe('projection document', () => {
  it('carries the schema version, kind, instant, and rows', () => {
    const document = projectAccessTokenConfigDocument(
      { [ACCOUNTS_FIELD]: [account('/repo')] },
      '2026-01-02T00:00:00.000Z',
    )
    expect(document).toEqual({
      schemaVersion: ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION,
      kind: ACCESS_TOKEN_CONFIG_FILE_KIND,
      updatedAt: '2026-01-02T00:00:00.000Z',
      accounts: [account('/repo')],
    })
    expect(serializeAccessTokenConfigDocument(document)).toBe(`${JSON.stringify(document, null, 2)}\n`)
  })
})

describe('decodeAccessTokenConfigPath', () => {
  it('reads a published path and ignores unusable payloads', () => {
    expect(decodeAccessTokenConfigPath({ path: '/home/.dsh/sdkwork/access-token.config.json' }))
      .toBe('/home/.dsh/sdkwork/access-token.config.json')
    expect(decodeAccessTokenConfigPath({ path: 42 })).toBe('')
    expect(decodeAccessTokenConfigPath(null)).toBe('')
    expect(decodeAccessTokenConfigPath('text')).toBe('')
  })
})
