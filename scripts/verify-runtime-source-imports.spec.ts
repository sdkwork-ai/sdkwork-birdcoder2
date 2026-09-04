/**
 * Spec for the built-artifact TypeScript-import gate. The gate exists because
 * this failure mode is invisible to typecheck (tsconfig paths) and to vitest
 * (Vite resolution) and only explodes when a real Node process boots, so the
 * detection logic itself has to be pinned down by tests.
 */

import { describe, expect, it } from 'vitest'

import {
  classifyImports,
  findRuntimeSourceImports,
  isBundlerInputArtifact,
  isInsideStringLiteral,
  owningPackageDir,
} from './verify-runtime-source-imports.ts'

/** Build an in-memory artifact for the scanner. */
function artifact(path: string, content: string): { path: string; content: string } {
  return { path, content }
}

describe('owningPackageDir', () => {
  it('resolves the repository-relative package directory', () => {
    expect(owningPackageDir('packages/host/sdkwork-api-gateway/lib/desktop.js'))
      .toBe('packages/host/sdkwork-api-gateway')
  })

  it('resolves apps-side artifacts', () => {
    expect(owningPackageDir('apps/desktop/lib/main.js')).toBe('apps/desktop')
  })

  it('returns undefined without a lib segment', () => {
    expect(owningPackageDir('packages/host/example/src/index.ts')).toBeUndefined()
  })
})

describe('isBundlerInputArtifact', () => {
  it('treats lib/types as bundler input', () => {
    expect(isBundlerInputArtifact('packages/host/example/lib/types/index.js')).toBe(true)
    expect(isBundlerInputArtifact('packages/host/example/lib/types/client/bind.js')).toBe(true)
  })

  it('treats shipped chunks as artifacts', () => {
    expect(isBundlerInputArtifact('packages/host/example/lib/index.js')).toBe(false)
    expect(isBundlerInputArtifact('packages/host/example/lib/api-gateway-CRDyTzIT.js')).toBe(false)
  })
})

describe('isInsideStringLiteral', () => {
  it('detects a quoted occurrence on the same line', () => {
    const line = 'ownerProps: ["viewRequest: import(\'./views.ts\') | null"],'
    expect(isInsideStringLiteral(line, line.indexOf('import('))).toBe(true)
  })

  it('leaves code position alone', () => {
    const line = 'const mod = await import("./helper.ts")'
    expect(isInsideStringLiteral(line, line.indexOf('import('))).toBe(false)
  })
})

describe('findRuntimeSourceImports', () => {
  it('flags a sibling src specifier in a shipped chunk', () => {
    const found = findRuntimeSourceImports([
      artifact(
        'packages/host/example/lib/api-gateway-abc123.js',
        'import { API_PATH } from "@deepseek-ai/dsh-client-connection/src/api-path.ts";\n',
      ),
    ])
    expect(found).toHaveLength(1)
    expect(found[0]?.specifier).toBe('@deepseek-ai/dsh-client-connection/src/api-path.ts')
    expect(found[0]?.packageDir).toBe('packages/host/example')
  })

  it('flags relative and dynamic TypeScript imports', () => {
    const found = findRuntimeSourceImports([
      artifact(
        'packages/host/example/lib/index.js',
        [
          'import { helper } from "./helper.ts"',
          'const lazy = await import("./lazy.mts")',
          'export * from "../shared/thing.tsx"',
        ].join('\n'),
      ),
    ])
    expect(found.map(entry => entry.specifier)).toEqual([
      './helper.ts',
      './lazy.mts',
      '../shared/thing.tsx',
    ])
  })

  it('ignores built JavaScript specifiers', () => {
    expect(findRuntimeSourceImports([
      artifact(
        'packages/host/example/lib/index.js',
        'import { a } from "./chunk-abc123.js"\nimport "ws"\n',
      ),
    ])).toEqual([])
  })

  it('skips lib/types bundler input', () => {
    expect(findRuntimeSourceImports([
      artifact(
        'packages/host/example/lib/types/index.js',
        'import { helper } from "@deepseek-ai/dsh-other/src/helper.ts"\n',
      ),
    ])).toEqual([])
  })

  it('ignores TypeScript specifiers embedded in documentation strings', () => {
    const content = 'const doc = { ownerProps: ["viewRequest: import(\'./views.ts\') | null"] }\n'
    expect(findRuntimeSourceImports([artifact('packages/host/example/lib/client.js', content)])).toEqual([])
  })
})

describe('classifyImports', () => {
  it('separates declared exemptions from blocking violations', () => {
    const found = findRuntimeSourceImports([
      artifact(
        'packages/test-support/client-runtime/lib/index.js',
        'import { bind } from "@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts"\n',
      ),
      artifact(
        'packages/host/example/lib/index.js',
        'import { helper } from "@deepseek-ai/dsh-other/src/helper.ts"\n',
      ),
    ])
    const { violations, exempted } = classifyImports(found)
    expect(exempted.map(entry => entry.packageDir)).toEqual(['packages/test-support/client-runtime'])
    expect(violations.map(entry => entry.packageDir)).toEqual(['packages/host/example'])
  })
})
