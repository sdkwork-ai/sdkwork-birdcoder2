// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { createAppBuildCatalogCache } from '../src/client/appBuild/catalogCache.ts'
import { appBuildMenuRows, appBuildRowId, decodeAppBuildRow } from '../src/client/appBuild/menuRows.tsx'
import type { AppBuildCatalog, AppBuildCommand, AppBuildFamily } from '../src/client/appBuild/contract.ts'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)

/** Requirements of a command that runs on any host. */
const PORTABLE = {
  hostOs: ['windows', 'macos', 'linux'],
  hostArch: null,
  tools: [],
  environmentAnyOf: [],
} as const

/**
 * One catalog command with the defaults every fixture shares. The capability
 * verdict defaults to runnable: the host decides it, so a fixture that wants a
 * blocked row states the whole verdict.
 */
function command(script: string, variant: string, extra: Partial<AppBuildCommand> = {}): AppBuildCommand {
  return {
    script,
    variant,
    environment: null,
    deploymentProfile: null,
    requirements: PORTABLE,
    runnable: true,
    blockedBy: null,
    missing: [],
    ...extra,
  }
}

const H5: AppBuildFamily = {
  id: 'h5',
  root: 'alpha-h5',
  rootPath: '/w/alpha/apps/alpha-h5',
  build: [
    command('build:dev', 'dev', { environment: 'dev' }),
    command('build:prod:cloud', 'prod · cloud', { environment: 'prod', deploymentProfile: 'cloud' }),
  ],
  package: [],
}

/** The iOS lane as a Windows host assesses it: macOS-only, so blocked. */
const IOS_ON_WINDOWS: Partial<AppBuildCommand> = {
  environment: 'prod',
  requirements: {
    hostOs: ['macos'], hostArch: null, tools: ['flutter', 'xcodebuild'], environmentAnyOf: [],
  },
  runnable: false,
  blockedBy: 'platform-unsupported',
  missing: ['macos'],
}

const FLUTTER: AppBuildFamily = {
  id: 'flutter-mobile',
  root: 'alpha-flutter-mobile',
  rootPath: '/w/alpha/apps/alpha-flutter-mobile',
  build: [
    command('build:flutter-android', 'android'),
    command('build:flutter-ios:prod', 'ios · prod', IOS_ON_WINDOWS),
  ],
  package: [],
}

const CATALOG: AppBuildCatalog = {
  cwd: '/w/alpha',
  families: [H5, FLUTTER],
  missing: [{ id: 'harmony', reason: 'toolchain-not-wired' }],
}

/** Submenu of one top-level row, or an empty list when the row has none. */
function submenuOf(rows: ReturnType<typeof appBuildMenuRows>, id: string): readonly MenuItem[] {
  const row = rows.find(entry => entry.id === id)
  return row === undefined ? [] : ((row as MenuItem).submenu ?? [])
}

describe('decodeAppBuildRow', () => {
  it('round-trips a row id back to its catalog command', () => {
    const target = decodeAppBuildRow(appBuildRowId('build', 1, 1), CATALOG)
    expect(target?.kind).toBe('build')
    expect(target?.family.id).toBe('flutter-mobile')
    expect(target?.command.script).toBe('build:flutter-ios:prod')
  })

  it('rejects foreign ids, unknown kinds and stale indices', () => {
    expect(decodeAppBuildRow('rename', CATALOG)).toBeUndefined()
    expect(decodeAppBuildRow('appbuild|deploy|0|0', CATALOG)).toBeUndefined()
    expect(decodeAppBuildRow(appBuildRowId('build', 9, 0), CATALOG)).toBeUndefined()
    expect(decodeAppBuildRow(appBuildRowId('build', 0, 9), CATALOG)).toBeUndefined()
    expect(decodeAppBuildRow(appBuildRowId('build', 0, 0), undefined)).toBeUndefined()
    // A package row decoded against a family with no package command.
    expect(decodeAppBuildRow(appBuildRowId('package', 0, 0), CATALOG)).toBeUndefined()
  })
})

describe('appBuildMenuRows', () => {
  it('offers a compile submenu listing every discovered command', () => {
    const rows = appBuildMenuRows({ catalog: CATALOG, t })
    expect(rows.map(row => row.id)).toEqual(['appbuild|menu|compile', 'appbuild|menu|package'])
    const compile = submenuOf(rows, 'appbuild|menu|compile')
    expect(compile.map(item => item.id)).toEqual([
      appBuildRowId('build', 0, 0),
      appBuildRowId('build', 0, 1),
      appBuildRowId('build', 1, 0),
      appBuildRowId('build', 1, 1),
      'appbuild|absent|build|harmony',
    ])
    expect(compile[0]?.disabled).toBeFalsy()
  })

  it('renders the host verdict instead of re-deriving it', () => {
    const compile = submenuOf(appBuildMenuRows({ catalog: CATALOG, t }), 'appbuild|menu|compile')
    const row = (index: number): MenuItem | undefined => compile.find(
      item => item.id === appBuildRowId('build', index, 1),
    )
    // Same family, same shape of script name: only the host's verdict differs,
    // and the renderer must not second-guess either one.
    expect(row(0)?.disabled).toBeFalsy()
    expect(row(1)?.disabled).toBe(true)
  })

  it('names what is unmet for every blocking reason', () => {
    const blocked = (
      variant: string, blockedBy: AppBuildCommand['blockedBy'], missing: readonly string[],
    ): AppBuildFamily => ({
      id: 'desktop',
      root: 'desktop',
      rootPath: '/w/alpha/apps/desktop',
      build: [command(`build:${variant}`, variant, { runnable: false, blockedBy, missing })],
      package: [],
    })
    const hintOf = (family: AppBuildFamily): string => {
      const submenu = submenuOf(
        appBuildMenuRows({ catalog: { cwd: '/w/alpha', families: [family], missing: [] }, t }),
        'appbuild|menu|compile',
      )
      const label = submenu[0]?.label
      return (label as { props?: { title?: string } } | undefined)?.props?.title ?? ''
    }
    // Host-OS and CPU tokens go through the dictionary…
    expect(hintOf(blocked('mac', 'platform-unsupported', ['macos']))).toBe('需要 macOS 构建主机')
    expect(hintOf(blocked('arm', 'architecture-unsupported', ['arm64']))).toBe('需要 ARM64 构建主机')
    // …while tool names, environment groups and entry paths are shown verbatim,
    // because they are literally what the operator must install or create.
    expect(hintOf(blocked('mac', 'toolchain-missing', ['flutter', 'xcodebuild'])))
      .toBe('本机缺少所需工具链：flutter、xcodebuild')
    expect(hintOf(blocked('mp', 'entry-missing', ['scripts/build-mini-program.mjs'])))
      .toBe('脚本引用的入口文件不存在：scripts/build-mini-program.mjs')
  })

  it('always renders the package row, explaining the families with no package script', () => {
    const rows = appBuildMenuRows({ catalog: CATALOG, t })
    const pack = submenuOf(rows, 'appbuild|menu|package')
    expect(pack).toHaveLength(1)
    expect(pack[0]?.disabled).toBe(true)
    expect(pack[0]?.id).toBe('appbuild|package-none')
  })

  it('lists a real package command when the family declares one', () => {
    const desktop: AppBuildFamily = {
      id: 'desktop',
      root: 'desktop',
      rootPath: '/w/alpha/apps/desktop',
      build: [command('build', 'default')],
      package: [command('package:win:x64', 'win · x64')],
    }
    const rows = appBuildMenuRows({
      catalog: { cwd: '/w/alpha', families: [desktop], missing: [] },
      t,
    })
    const pack = submenuOf(rows, 'appbuild|menu|package')
    expect(pack.map(item => item.id)).toEqual([appBuildRowId('package', 0, 0)])
    expect(pack[0]?.disabled).toBeFalsy()
  })

  it('shows nothing without a catalog or without any family', () => {
    expect(appBuildMenuRows({ catalog: undefined, t })).toEqual([])
    expect(appBuildMenuRows({
      catalog: { cwd: '/w', families: [], missing: [{ id: 'h5', reason: 'no-app-root' }] },
      t,
    })).toEqual([])
  })
})

describe('createAppBuildCatalogCache', () => {
  it('serves a cached catalog within the TTL and re-probes after it', async () => {
    let clock = 0
    const probe = vi.fn(async () => CATALOG)
    const cache = createAppBuildCatalogCache(() => ({ describe: probe }), () => clock)
    await cache.read('/w/alpha')
    await cache.read('/w/alpha')
    expect(probe).toHaveBeenCalledTimes(1)
    clock = 20_000
    await cache.read('/w/alpha')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed probe, so the next open retries', async () => {
    let attempts = 0
    const probe = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('host hiccup')
      return CATALOG
    })
    const cache = createAppBuildCatalogCache(() => ({ describe: probe }))
    expect(await cache.read('/w/alpha')).toBeUndefined()
    expect(await cache.read('/w/alpha')).toEqual(CATALOG)
  })

  it('coalesces concurrent probes for one workspace', async () => {
    const probe = vi.fn(async () => CATALOG)
    const cache = createAppBuildCatalogCache(() => ({ describe: probe }))
    await Promise.all([cache.read('/w/alpha'), cache.read('/w/alpha'), cache.read('/w/alpha')])
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('answers undefined without a mounted port and after invalidation', async () => {
    const empty = createAppBuildCatalogCache(() => undefined)
    expect(await empty.read('/w/alpha')).toBeUndefined()
    const probe = vi.fn(async () => CATALOG)
    const cache = createAppBuildCatalogCache(() => ({ describe: probe }))
    await cache.read('/w/alpha')
    cache.invalidate()
    await cache.read('/w/alpha')
    expect(probe).toHaveBeenCalledTimes(2)
  })
})
