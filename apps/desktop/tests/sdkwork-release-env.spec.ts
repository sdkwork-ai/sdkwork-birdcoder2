import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE,
  DESKTOP_SDKWORK_RELEASE_ENV_RESOURCE,
  resolveSdkworkReleaseEnvFile,
} from '../src/sdkwork-release-env.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function resources(withArtifact: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-sdkwork-release-env-'))
  roots.push(root)
  if (withArtifact) writeFileSync(join(root, DESKTOP_SDKWORK_RELEASE_ENV_RESOURCE), 'SDKWORK_ACCESS_TOKEN=token\n')
  return root
}

describe('resolveSdkworkReleaseEnvFile', () => {
  it('uses the resource a packaged application carries', () => {
    const directory = resources(true)
    expect(resolveSdkworkReleaseEnvFile({ packaged: true, resourcesPath: directory, environment: {} }))
      .toBe(join(directory, DESKTOP_SDKWORK_RELEASE_ENV_RESOURCE))
  })

  it('returns nothing for a packaged application without the resource or a source launch', () => {
    expect(resolveSdkworkReleaseEnvFile({ packaged: true, resourcesPath: resources(false), environment: {} }))
      .toBeUndefined()
    expect(resolveSdkworkReleaseEnvFile({ packaged: false, resourcesPath: resources(true), environment: {} }))
      .toBeUndefined()
  })

  it('lets an explicit path win in any launch mode', () => {
    for (const packaged of [true, false]) {
      expect(resolveSdkworkReleaseEnvFile({
        packaged,
        resourcesPath: resources(false),
        environment: { [DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE]: ' C:\\deployments\\release.env ' },
      })).toBe('C:\\deployments\\release.env')
    }
  })
})
