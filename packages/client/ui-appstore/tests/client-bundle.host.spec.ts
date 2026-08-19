/** Pins the App Store client bundle closure: SDKWork packages inline, platform modules stay external. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Node built-in require calls that must be shimmed or avoided — never loader externals. */
const FORBIDDEN_NODE_BUILTIN_REQUIRES = [
  'require("util")',
  'require("stream")',
  'require("zlib")',
  'require("assert")',
  'require("buffer")',
] as const

describe('ui-appstore client bundle', () => {
  it('inlines SDKWork packages and avoids Node built-in loader externals', () => {
    const bundlePath = join(import.meta.dirname, '../lib/client.js')
    if (!existsSync(bundlePath)) {
      throw new Error('ui-appstore lib/client.js is missing — run pnpm --filter @deepseek-ai/dsh-client-ui-appstore run bundle')
    }
    const source = readFileSync(bundlePath, 'utf8')
    expect(source).not.toMatch(/require\("@sdkwork\//)
    for (const pattern of FORBIDDEN_NODE_BUILTIN_REQUIRES) {
      expect(source).not.toContain(pattern)
    }
  })
})
