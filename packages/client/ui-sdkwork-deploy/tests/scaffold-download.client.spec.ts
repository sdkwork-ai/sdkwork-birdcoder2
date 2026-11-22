/** Download target planning and the install + repository-reconciliation chain. */
import { describe, expect, it } from 'vitest'
import {
  installScaffoldIntoProject,
  planScaffoldInstallTarget,
  ScaffoldInstallTargetError,
  type ScaffoldInstallPorts,
  type ScaffoldInstallRequest,
} from '../src/client/scaffoldDownload.ts'
import type { ScaffoldInstallProgress } from '../src/client/installScaffold.ts'

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-h5', name: '演示 H5', displayName: '演示 H5' },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5'] },
})

const INDEX = `# apps/

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| pc | pc | yes | PC | [README](pc/README.md) |
`

const REQUEST: ScaffoldInstallRequest = {
  templateId: 'tpl-1',
  templateKey: 'sdkwork-demo-h5',
  displayName: '演示 H5',
  projectDirectory: '/proj',
  mode: 'apps',
}

function ports(overrides: Partial<ScaffoldInstallPorts> = {}): ScaffoldInstallPorts & {
  readonly written: Map<string, string>
  readonly created: string[]
} {
  const written = new Map<string, string>()
  const created: string[] = []
  const base: ScaffoldInstallPorts = {
    listApps: async () => ['sdkwork-demo-h5'],
    createDirectory: async (parent, name) => {
      created.push(`${parent}/${name}`)
      return `${parent}/${name}`
    },
    readTextFile: async (path) => {
      if (path === '/proj/apps/README.md') return INDEX
      if (path === '/proj/apps/sdkwork-demo-h5-2/agent.app.config.json') return MANIFEST
      if (path === '/proj/apps/sdkwork-demo-h5-2/README.md') return '# Demo\n'
      return undefined
    },
    writeTextFile: async (path, content) => {
      written.set(path, content)
      return true
    },
    installInto: async () => ({ fileCount: 7, totalBytes: 4096, version: '1.0.0', displayName: '演示 H5' }),
    writeScaffoldLink: async () => true,
  }
  return Object.assign(base, { written, created }, overrides)
}

describe('planScaffoldInstallTarget', () => {
  it('installs under apps/ and appends a numeric suffix while the name is taken', () => {
    const target = planScaffoldInstallTarget(REQUEST, ['sdkwork-demo-h5', 'sdkwork-demo-h5-2'])
    expect(target).toMatchObject({
      mode: 'apps',
      parent: '/proj/apps',
      directoryName: 'sdkwork-demo-h5-3',
      directory: '/proj/apps/sdkwork-demo-h5-3',
      renamed: true,
    })
  })

  it('creates apps/ path when no directory listing is available', () => {
    expect(planScaffoldInstallTarget(REQUEST, undefined).directory).toBe('/proj/apps/sdkwork-demo-h5')
  })

  it('uses a custom absolute directory as-is', () => {
    const target = planScaffoldInstallTarget({ ...REQUEST, mode: 'custom', customDirectory: '/tmp/apps/sdkwork-demo-h5' }, [])
    expect(target).toMatchObject({
      mode: 'custom',
      parent: '/tmp/apps',
      directoryName: 'sdkwork-demo-h5',
      directory: '/tmp/apps/sdkwork-demo-h5',
      renamed: false,
    })
  })

  it('accepts a Windows drive path as custom', () => {
    const nested = planScaffoldInstallTarget(
      { ...REQUEST, mode: 'custom', customDirectory: 'C:\\work\\apps\\demo' },
      undefined,
    )
    expect(nested.directoryName).toBe('demo')
    expect(nested.parent).toBe('C:\\work\\apps')
    const driveRoot = planScaffoldInstallTarget(
      { ...REQUEST, mode: 'custom', customDirectory: 'C:\\demo' },
      undefined,
    )
    expect(driveRoot.parent).toBe('C:\\')
    expect(driveRoot.directoryName).toBe('demo')
  })

  it('accepts a POSIX root child as custom', () => {
    const target = planScaffoldInstallTarget(
      { ...REQUEST, mode: 'custom', customDirectory: '/demo' },
      undefined,
    )
    expect(target.parent).toBe('/')
    expect(target.directoryName).toBe('demo')
  })

  it('rejects relative or blank custom targets and unsafe directory names', () => {
    expect(() => planScaffoldInstallTarget({ ...REQUEST, mode: 'custom', customDirectory: 'relative/path' }, []))
      .toThrow(ScaffoldInstallTargetError)
    expect(() => planScaffoldInstallTarget({ ...REQUEST, mode: 'custom' }, []))
      .toThrow(ScaffoldInstallTargetError)
    expect(() => planScaffoldInstallTarget({ ...REQUEST, directoryName: 'a/b' }, []))
      .toThrow(ScaffoldInstallTargetError)
  })
})

describe('installScaffoldIntoProject', () => {
  it('creates the renamed app directory, records the linkage, and updates apps/README.md', async () => {
    const p = ports()
    const progress: ScaffoldInstallProgress[] = []
    const outcome = await installScaffoldIntoProject(p, REQUEST, (event) => { progress.push(event) })
    expect(outcome).toMatchObject({
      templateId: 'tpl-1',
      displayName: '演示 H5',
      version: '1.0.0',
      directory: '/proj/apps/sdkwork-demo-h5-2',
      fileCount: 7,
      manifestFound: true,
      linkWritten: true,
      indexUpdated: true,
    })
    expect(outcome.warnings[0]).toContain('already exists in apps/')
    const index = p.written.get('/proj/apps/README.md')
    expect(index).toContain('| sdkwork-demo-h5-2 | h5 | yes | 演示 H5 | [README](sdkwork-demo-h5-2/README.md) |')
    expect(progress).toEqual([])
  })

  it('creates apps/ before the target when the project has no apps directory', async () => {
    const p = ports({ listApps: async () => undefined })
    const outcome = await installScaffoldIntoProject(p, REQUEST)
    expect(outcome.directory).toBe('/proj/apps/sdkwork-demo-h5')
    expect(p.created).toEqual(['/proj/apps', '/proj/apps/sdkwork-demo-h5'])
  })

  it('warns about a missing manifest without fabricating one', async () => {
    const p = ports({
      listApps: async () => ['sdkwork-demo-h5'],
      readTextFile: async path => (path === '/proj/apps/README.md' ? INDEX : undefined),
      writeScaffoldLink: async () => false,
    })
    const outcome = await installScaffoldIntoProject(p, REQUEST)
    expect(outcome.manifestFound).toBe(false)
    expect(outcome.linkWritten).toBe(false)
    expect(outcome.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('agent.app.config.json'),
    ]))
  })

  it('warns when an existing manifest refuses the scaffold linkage', async () => {
    const p = ports({ writeScaffoldLink: async () => false })
    const outcome = await installScaffoldIntoProject(p, REQUEST)
    expect(outcome.manifestFound).toBe(true)
    expect(outcome.linkWritten).toBe(false)
    expect(outcome.warnings.join(' ')).toContain('scaffold identity')
  })

  it('skips the apps index for a custom target', async () => {
    const p = ports()
    const outcome = await installScaffoldIntoProject(p, {
      ...REQUEST,
      mode: 'custom',
      customDirectory: '/tmp/demo',
    })
    expect(outcome.directory).toBe('/tmp/demo')
    expect(outcome.indexUpdated).toBe(false)
    expect(p.written.size).toBe(0)
  })

  it('warns when the directory index table is absent', async () => {
    const p = ports({
      listApps: async () => [],
      readTextFile: async path => (path === '/proj/apps/README.md' ? '# apps\n' : undefined),
    })
    const outcome = await installScaffoldIntoProject(p, REQUEST)
    expect(outcome.indexUpdated).toBe(false)
    expect(outcome.warnings.join(' ')).toContain('directory index')
  })

  it('warns when apps/README.md is missing', async () => {
    const p = ports({
      listApps: async () => [],
      readTextFile: async () => undefined,
    })
    const outcome = await installScaffoldIntoProject(p, REQUEST)
    expect(outcome.warnings.join(' ')).toContain('apps/README.md was not found')
  })

  it('fails when the app directory cannot be created', async () => {
    const p = ports({ createDirectory: async () => undefined })
    await expect(installScaffoldIntoProject(p, REQUEST)).rejects.toThrow('cannot create the app directory')
  })
})
