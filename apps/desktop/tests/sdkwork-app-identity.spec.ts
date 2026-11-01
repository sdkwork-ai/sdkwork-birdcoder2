import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SDKWORK_APPLICATION_CODE_VARIABLE,
  SDKWORK_APP_IDENTITY_RESOURCE,
  parseSdkworkAppIdentity,
  renderSdkworkAppIdentity,
  resolveSdkworkApplicationCode,
} from '../src/sdkwork-app-identity.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function resources(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-sdkwork-app-identity-'))
  roots.push(root)
  return root
}

function writeIdentity(directory: string, contents: string): string {
  const path = join(directory, SDKWORK_APP_IDENTITY_RESOURCE)
  mkdirSync(directory, { recursive: true })
  writeFileSync(path, contents)
  return path
}

describe('renderSdkworkAppIdentity', () => {
  it('round-trips the code through the parser', () => {
    expect(parseSdkworkAppIdentity(renderSdkworkAppIdentity('birdcoder2')))
      .toEqual({ schemaVersion: 1, applicationCode: 'birdcoder2' })
  })

  it('rejects another schema version, an empty code, and malformed JSON', () => {
    expect(parseSdkworkAppIdentity('{"schemaVersion":2,"applicationCode":"birdcoder2"}')).toBeUndefined()
    expect(parseSdkworkAppIdentity('{"schemaVersion":1,"applicationCode":"  "}')).toBeUndefined()
    expect(parseSdkworkAppIdentity('{"schemaVersion":1}')).toBeUndefined()
    expect(parseSdkworkAppIdentity('not json')).toBeUndefined()
    expect(parseSdkworkAppIdentity('null')).toBeUndefined()
  })
})

describe('resolveSdkworkApplicationCode', () => {
  it('prefers an explicit launch declaration over the packaged identity', () => {
    const directory = resources()
    writeIdentity(directory, renderSdkworkAppIdentity('packaged-code'))
    expect(resolveSdkworkApplicationCode({
      packaged: true,
      resourcesPath: directory,
      environment: { [SDKWORK_APPLICATION_CODE_VARIABLE]: ' declared-code ' },
    })).toBe('declared-code')
  })

  it('reads the packaged identity an installed application carries', () => {
    const directory = resources()
    const path = writeIdentity(directory, renderSdkworkAppIdentity('birdcoder2'))
    expect(resolveSdkworkApplicationCode({ packaged: true, resourcesPath: directory, environment: {} }))
      .toBe('birdcoder2')
    expect(path).toBe(join(directory, SDKWORK_APP_IDENTITY_RESOURCE))
  })

  it('resolves nothing for a source launch, a missing resource, or an unreadable document', () => {
    const directory = resources()
    expect(resolveSdkworkApplicationCode({ packaged: false, resourcesPath: directory, environment: {} }))
      .toBeUndefined()
    expect(resolveSdkworkApplicationCode({ packaged: true, resourcesPath: directory, environment: {} }))
      .toBeUndefined()
    writeIdentity(directory, 'not json')
    expect(resolveSdkworkApplicationCode({ packaged: true, resourcesPath: directory, environment: {} }))
      .toBeUndefined()
  })
})
