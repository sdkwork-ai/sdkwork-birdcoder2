/**
 * App library discovery (`discoverAppLibrary`): every manifest-carrying
 * directory lists with its derived identity, build outputs and hidden trees
 * are pruned, file children terminate their branch, the depth and directory
 * budgets bound the walk, and the canonical linkage profile picks the
 * recorded app id.
 */
import { describe, expect, it } from 'vitest'
import {
  discoverAppLibrary,
  type AppLibraryScanPort,
} from '../src/client/appLibrary.ts'

/** An in-memory workspace: explicit directories plus a flat file map. */
function portOf(
  directories: string[],
  files: Record<string, string>,
): AppLibraryScanPort {
  return {
    async listDirectory(path) {
      if (!directories.includes(path)) return undefined
      const parent = (child: string): string => child.slice(0, child.lastIndexOf('/'))
      const names = new Set<string>()
      for (const directory of directories) {
        if (parent(directory) === path && directory !== path) names.add(directory.slice(path.length + 1))
      }
      for (const file of Object.keys(files)) {
        if (parent(file) === path) names.add(file.slice(path.length + 1))
      }
      return {
        path,
        entries: [...names].map(name => ({ name, path: `${path}/${name}`, hidden: name.startsWith('.') })),
      }
    },
    async readTextFile(path) {
      const raw = files[path]
      if (raw === undefined) throw new Error(`missing ${path}`)
      return raw
    },
  }
}

const STORE_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: {
    key: 'store',
    name: 'store',
    displayName: 'Store',
    description: 'Everything store.',
    appType: 'APP_REACT',
    iconUrl: 'https://cdn.test/store.png',
  },
  runtime: { family: 'web', framework: 'react' },
  publish: { platforms: ['WEB', 'H5'] },
  metadata: {
    publishing: {
      appIdByTarget: { 'standalone.development': 'app-uuid-1' },
      birdcoder: { appId: 'app-uuid-1', appName: 'Store' },
    },
  },
})

const PC_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { name: 'store-pc', displayName: 'Store PC' },
  runtime: { family: 'web', framework: 'react' },
  publish: { platforms: ['WEB'] },
})

describe('discoverAppLibrary', () => {
  it('lists every manifest project with its derived identity, sorted by name', async () => {
    const entries = await discoverAppLibrary(
      portOf(
        ['/w', '/w/store', '/w/store/apps', '/w/store/apps/store-pc', '/w/legacy'],
        {
          '/w/store/agent.app.config.json': STORE_MANIFEST,
          '/w/store/apps/store-pc/agent.app.config.json': PC_MANIFEST,
          '/w/legacy/README.md': 'no manifest here',
        },
      ),
      '/w',
    )
    expect(entries.map(entry => entry.name)).toEqual(['Store', 'Store PC'])
    const [store, pc] = entries
    expect(store.directory).toBe('/w/store')
    expect(store.cardId).toBe('pc-web')
    expect(store.description).toBe('Everything store.')
    expect(store.iconUrl).toBe('https://cdn.test/store.png')
    expect(store.linkedAppId).toBe('app-uuid-1')
    expect(store.linkedAppName).toBe('Store')
    expect(pc.directory).toBe('/w/store/apps/store-pc')
    expect(pc.cardId).toBe('pc-web')
    expect(pc.linkedAppId).toBeUndefined()
  }, 30000)

  it('prunes hidden children, build outputs, and file children', async () => {
    const entries = await discoverAppLibrary(
      portOf(
        [
          '/w',
          '/w/store',
          '/w/.hidden',
          '/w/node_modules',
          '/w/node_modules/pkg',
          '/w/dist',
          '/w/dist/app',
        ],
        {
          '/w/store/agent.app.config.json': STORE_MANIFEST,
          '/w/.hidden/agent.app.config.json': PC_MANIFEST,
          '/w/node_modules/pkg/agent.app.config.json': PC_MANIFEST,
          '/w/dist/app/agent.app.config.json': PC_MANIFEST,
        },
      ),
      '/w',
    )
    expect(entries.map(entry => entry.directory)).toEqual(['/w/store'])
  }, 30000)

  it('stops at the directory budget', async () => {
    const entries = await discoverAppLibrary(
      portOf(
        ['/w', '/w/store', '/w/store/apps', '/w/store/apps/store-pc'],
        {
          '/w/agent.app.config.json': STORE_MANIFEST,
          '/w/store/apps/store-pc/agent.app.config.json': PC_MANIFEST,
        },
      ),
      '/w',
      { maxDirectories: 1 },
    )
    expect(entries.map(entry => entry.directory)).toEqual(['/w'])
  }, 30000)

  it('ignores a damaged manifest instead of failing the scan', async () => {
    const entries = await discoverAppLibrary(
      portOf(['/w', '/w/broken'], {
        '/w/broken/agent.app.config.json': '{ not json',
      }),
      '/w',
    )
    expect(entries).toEqual([])
  }, 30000)

  it('picks the linkage recorded under the resolved deployment profile', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { name: 'store', displayName: 'Store' },
      runtime: { family: 'web', framework: 'react' },
      publish: { platforms: ['WEB'] },
      metadata: {
        publishing: {
          appIdByTarget: { 'standalone.development': 'app-uuid-1', 'cloud.production': 'app-uuid-2' },
        },
      },
    })
    const entries = await discoverAppLibrary(
      portOf(['/w', '/w/store'], { '/w/store/agent.app.config.json': manifest }),
      '/w',
      { profileIdOf: () => 'cloud.production' },
    )
    expect(entries[0]?.linkedAppId).toBe('app-uuid-2')
  }, 30000)
})
