/** The vendored `dsh-better-sidebar` submodule: the page model this fork's
 * registry mirrors, plus the read-only rule.
 *
 * Two facts are enforced here rather than trusted to prose:
 *
 * 1. `plugins/dsh-better-sidebar` has no modification of its tracked files.
 *    The submodule is upstream-owned (its own AGENTS.md forbids changing DSH
 *    and this repository forbids changing it); a local fix belongs upstream
 *    followed by a pin bump, never a working-tree edit.
 * 2. The descriptor fields `ctx.sdkworkSidebar` mirrors (`id`, `title`, `icon`,
 *    `order`) still exist on upstream's `TabDescriptor`. If upstream renames or
 *    drops one, this spec fails and the fork's `SidebarPageDescriptor` must be
 *    re-resolved before the next pin bump.
 *
 * Both checks skip on a checkout without the submodule populated (a shallow
 * consumer checkout), so an uninitialized submodule never masquerades as a
 * source modification. */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const SUBMODULE = resolve(REPO_ROOT, 'plugins/dsh-better-sidebar')
const UPSTREAM_SERVICE = resolve(SUBMODULE, 'src/client/service.ts')
const initialized = existsSync(UPSTREAM_SERVICE)

describe('dsh-better-sidebar submodule', () => {
  it.skipIf(!initialized)('keeps every tracked source file unmodified', () => {
    const porcelain = execFileSync(
      'git',
      ['-C', SUBMODULE, 'status', '--porcelain', '--untracked-files=no'],
      { encoding: 'utf8' },
    )
    expect(porcelain.trim()).toBe('')
  })

  it.skipIf(!initialized)('still declares the descriptor fields the page registry mirrors', () => {
    const source = readFileSync(UPSTREAM_SERVICE, 'utf8')
    const start = source.indexOf('export interface TabDescriptor {')
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, source.indexOf('\n}', start) + 2)
    for (const field of ['id: string', 'title: string | (() => string)', 'icon?', 'order?']) {
      expect(block, `TabDescriptor lost "${field}"`).toContain(field)
    }
  })
})
