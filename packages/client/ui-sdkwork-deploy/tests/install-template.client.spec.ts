/** Use-template install service behavior: version resolution, the
 * not-installable refusal, download/write progress, and the outcome facts. */
import { describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  installTemplateVersion,
  TemplateNotInstallableError,
} from '../src/client/installTemplate.ts'
import type { DriveContentReader } from '../src/client/templateInstall.ts'

/** Archive bytes for a two-file template (one text, one binary). */
const archive = zipSync({
  'src/main.ts': strToU8('export const app = 1;\n'),
  'assets/logo.bin': new Uint8Array([0x00, 0x01, 0x02]),
})

/** A Drive reader serving one chunk with the archive bytes. */
const drive = (): DriveContentReader => ({
  drive: {
    nodes: {
      content: {
        retrieve: vi.fn(async () => ({
          content: btoa(String.fromCharCode(...archive)),
          sizeBytes: archive.length,
          hasMore: false,
        })),
      },
    },
  },
})

/** Structural template/artifact faces resolving to one artifact version. */
function faces(overrides: {
  latestVersionUuid?: string
  versions?: Array<{ id: string; version: string; artifactUuid?: string }>
  driveNodeId?: string
} = {}) {
  const versions = overrides.versions ?? [
    { id: 'v-1', version: '0.1.0', artifactUuid: 'art-1' },
  ]
  const writeFile = vi.fn(async (_request: {
    targetDirectory: string
    relativePath: string
    contentBase64: string
  }) => ({ absolutePath: '/t/x', bytes: 1 }))
  return {
    deps: {
      templates: {
        appTemplates: {
          retrieve: vi.fn(async () => ({
            id: 'tpl-1',
            displayName: 'PC 管理台模板',
            templateKey: 'pc-admin',
            version: '0.1.0',
            ...(overrides.latestVersionUuid === undefined ? {} : { latestVersionUuid: overrides.latestVersionUuid }),
          })),
        },
        appTemplateVersions: {
          list: vi.fn(async () => ({ items: versions })),
        },
      },
      artifacts: {
        artifact: {
          retrieve: vi.fn(async () => ('driveNodeId' in overrides ? { driveNodeId: overrides.driveNodeId } : { driveNodeId: 'node-1' })),
        },
      },
      drive: drive(),
      writeFile,
    },
    writeFile,
  }
}

describe('installTemplateVersion', () => {
  it('installs every planned file and reports the outcome facts', async () => {
    const { deps, writeFile } = faces()
    const report = vi.fn()
    const outcome = await installTemplateVersion({ ...deps, reportProgress: report }, {
      templateId: 'tpl-1',
      targetDirectory: '/picked/dir',
    })
    expect(outcome).toMatchObject({
      templateName: 'PC 管理台模板',
      templateKey: 'pc-admin',
      version: '0.1.0',
      fileCount: 2,
      textCount: 1,
      binaryCount: 1,
    })
    expect(writeFile).toHaveBeenCalledTimes(2)
    // Writes follow the archive's own entry order.
    const first = writeFile.mock.calls[0]?.[0]
    expect(first?.targetDirectory).toBe('/picked/dir')
    expect(first?.relativePath).toBe('src/main.ts')
    expect(first?.contentBase64).toBe(btoa('export const app = 1;\n'))
    expect(report).toHaveBeenCalledWith({ kind: 'download', percent: 100 })
    expect(report).toHaveBeenCalledWith({ kind: 'write', file: 'assets/logo.bin', index: 2, total: 2 })
  })

  it('prefers the template\'s latest artifact version over older rows', async () => {
    const { deps } = faces({
      latestVersionUuid: 'v-2',
      versions: [
        { id: 'v-1', version: '0.1.0', artifactUuid: 'art-1' },
        { id: 'v-2', version: '0.2.0', artifactUuid: 'art-2' },
      ],
    })
    const outcome = await installTemplateVersion(deps, { templateId: 'tpl-1', targetDirectory: '/t' })
    expect(outcome.version).toBe('0.2.0')
    expect(deps.artifacts.artifact.retrieve).toHaveBeenCalledWith('art-2')
  })

  it('refuses a template whose versions carry no artifact', async () => {
    const { deps } = faces({ versions: [{ id: 'v-1', version: '0.1.0' }] })
    await expect(installTemplateVersion(deps, { templateId: 'tpl-1', targetDirectory: '/t' }))
      .rejects.toBeInstanceOf(TemplateNotInstallableError)
  })

  it('refuses an artifact without a Drive node reference', async () => {
    const { deps } = faces({ driveNodeId: undefined })
    await expect(installTemplateVersion(deps, { templateId: 'tpl-1', targetDirectory: '/t' }))
      .rejects.toBeInstanceOf(TemplateNotInstallableError)
  })
})
