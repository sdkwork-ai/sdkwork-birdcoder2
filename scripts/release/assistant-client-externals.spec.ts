/** Regression coverage for the assistant bundle's Web module-table boundary. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertAssistantClientExternals,
  clientBundleRequires,
  declaredClientExternals,
  unsupportedClientRequires,
} from './assistant-client-externals.ts'

const roots: string[] = []

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-assistant-externals-'))
  roots.push(root)
  return root
}

function writePackage(root: string, source: string, manifest: unknown = { name: '@botharness/ui' }): string {
  const packageRoot = join(root, 'packages', 'client')
  mkdirSync(join(packageRoot, 'lib'), { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(packageRoot, 'lib', 'client.js'), source)
  return packageRoot
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('assistant client externals', () => {
  it('collects bare requires and ignores local, absolute, and member calls', () => {
    const source = [
      'const react = require("react")',
      "const local = require('./chunk.js')",
      "const absolute = require('/tmp/chunk.js')",
      'const member = module.require("ignored")',
      'const again = require("react")',
    ].join('\n')

    expect(clientBundleRequires(source)).toEqual(['react'])
  })

  it('reports a bundle request no platform seed or declaration supplies', () => {
    const source = 'const q = require("@tanstack/react-query")'
    expect(unsupportedClientRequires(source, [])).toEqual(['@tanstack/react-query'])
    expect(unsupportedClientRequires(source, ['@tanstack/react-query'])).toEqual([])
  })

  it('accepts seed modules and declared client externals', () => {
    const source = [
      'require("react")',
      'require("react/jsx-runtime")',
      'require("@deepseek-ai/dsh-client-store")',
      'require("@deepseek-ai/dsh-api-gateway/client")',
    ].join('\n')

    expect(unsupportedClientRequires(source, ['@deepseek-ai/dsh-api-gateway/client'])).toEqual([])
  })

  it('reads declared externals defensively from the manifest', () => {
    expect(declaredClientExternals({ dsh: { client: { external: ['a', 1, 'a'] } } })).toEqual(['a', 'a'])
    expect(declaredClientExternals({ dsh: {} })).toEqual([])
    expect(declaredClientExternals(null)).toEqual([])
  })

  it('refuses a package whose bundle requests an unsupplied module', () => {
    const root = fixtureRoot()
    const client = writePackage(root, 'require("@tanstack/react-query")')
    expect(() => { assertAssistantClientExternals(client, '@botharness/ui') })
      .toThrow(/requires @tanstack\/react-query.*module table cannot supply/)
  })

  it('accepts a package whose bundle requests only seeded and declared modules', () => {
    const root = fixtureRoot()
    const client = writePackage(
      root,
      'require("react")\nrequire("@deepseek-ai/dsh-api-gateway/client")',
      { name: '@botharness/ui', dsh: { client: { external: ['@deepseek-ai/dsh-api-gateway/client'] } } },
    )
    expect(() => { assertAssistantClientExternals(client, '@botharness/ui') }).not.toThrow()
  })
})
