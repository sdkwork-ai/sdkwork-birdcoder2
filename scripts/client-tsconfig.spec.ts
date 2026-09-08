/** Regression coverage for source declarations owned by the client test aggregate. */

import { existsSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

function clientCssDeclarations(): string[] {
  const clientGroups = ['client', 'extensions']
  return clientGroups.flatMap((group) => {
    const clientRoot = resolve(root, 'packages', group)
    return readdirSync(clientRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => resolve(clientRoot, entry.name, 'src/css-modules.d.ts'))
  })
    .filter(existsSync)
    .map(file => file.replaceAll(sep, '/'))
    .sort()
}

describe('client TypeScript aggregate', () => {
  it('loads package CSS declarations without relying on workspace-link realpaths', () => {
    const configPath = resolve(root, 'tsconfig.client.tests.json')
    const read = ts.readConfigFile(configPath, file => ts.sys.readFile(file))
    if (read.error !== undefined) {
      throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
    const loaded = parsed.fileNames
      .map(file => file.replaceAll(sep, '/'))
      .filter(file => file.endsWith('/src/css-modules.d.ts'))
      .sort()
    expect(loaded).toEqual(clientCssDeclarations())
  })

  it('keeps the build solution program-less (test aggregate moved out of the build)', () => {
    const configPath = resolve(root, 'tsconfig.client.json')
    const read = ts.readConfigFile(configPath, file => ts.sys.readFile(file))
    if (read.error !== undefined) {
      throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
    // The build solution may only carry references (each referenced project
    // emits its own lib/types for the tsdown Client pass). A root program here
    // would re-run the full client test aggregate on every `build:lib:client`.
    expect(parsed.fileNames).toEqual([])
  })

  it('mirrors the build solution references into the test aggregate', () => {
    const references = (file: string): string[] => {
      const configPath = resolve(root, file)
      const read = ts.readConfigFile(configPath, path => ts.sys.readFile(path))
      if (read.error !== undefined) {
        throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
      }
      const config = read.config as { references?: ReadonlyArray<{ path?: string }> }
      return (config.references ?? [])
        .map(reference => reference.path)
        .filter((path): path is string => typeof path === 'string')
    }
    // The aggregate type-checks imports into referenced projects through their
    // emitted lib/types (project-reference redirects), so tsconfig.client.tests.json
    // must carry the same project list tsconfig.client.json builds.
    expect(references('tsconfig.client.tests.json')).toEqual(references('tsconfig.client.json'))
  })
})
