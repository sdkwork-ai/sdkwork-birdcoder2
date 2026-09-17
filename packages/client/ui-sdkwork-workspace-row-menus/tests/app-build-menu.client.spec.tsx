// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { WorkspaceRowMenu } from '../src/client/RowMenus.tsx'
import { zh } from '../src/client/locales.ts'
import type { AppBuildCatalog, AppBuildCommand, AppBuildFamily, AppBuildService } from '../src/client/appBuild/contract.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)
const TRIGGER = 'row-trigger-class'
const TRIGGER_NAME = '工作区“Project”的操作'

/** Requirements of a command that runs on any host. */
const PORTABLE = {
  hostOs: ['windows', 'macos', 'linux'],
  hostArch: null,
  tools: [],
  environmentAnyOf: [],
} as const

/** One catalog command with the defaults every fixture shares (runnable). */
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

const FLUTTER: AppBuildFamily = {
  id: 'flutter-mobile',
  root: 'alpha-flutter-mobile',
  rootPath: '/w/alpha/apps/alpha-flutter-mobile',
  build: [
    command('build:flutter-android', 'android'),
    // The verdict a Windows host reaches: `flutter build ipa` is macOS-only.
    command('build:flutter-ios:prod', 'ios · prod', {
      requirements: {
        hostOs: ['macos'], hostArch: null, tools: ['flutter', 'xcodebuild'], environmentAnyOf: [],
      },
      runnable: false,
      blockedBy: 'platform-unsupported',
      missing: ['macos'],
    }),
  ],
  package: [],
}

const CATALOG: AppBuildCatalog = {
  cwd: '/w/alpha',
  families: [
    {
      id: 'h5',
      root: 'alpha-h5',
      rootPath: '/w/alpha/apps/alpha-h5',
      build: [command('build:dev', 'dev', { environment: 'dev' })],
      package: [],
    },
    FLUTTER,
  ],
  missing: [{ id: 'harmony', reason: 'toolchain-not-wired' }],
}

/** Render the workspace row menu with an app-build service and open it. */
function openMenu(appBuild?: AppBuildService) {
  render(
    <div>
      <WorkspaceRowMenu
        label="Project"
        cwd="/w/alpha"
        actions={{ rename: vi.fn(), delete: vi.fn() }}
        iconButtonClassName={TRIGGER}
        appBuild={appBuild}
        t={t}
      />
    </div>,
  )
  fireEvent.click(screen.getByRole('button', { name: TRIGGER_NAME }))
}

/** Expand one submenu parent by hovering its row. */
async function expand(name: string) {
  const parent = await screen.findByRole('menuitem', { name })
  fireEvent.mouseEnter(parent)
  return parent
}

describe('WorkspaceRowMenu app-build rows', () => {
  it('derives compile and package rows from the probed catalog and launches the chosen command', async () => {
    const service: AppBuildService = { describe: vi.fn(async () => CATALOG), run: vi.fn() }
    openMenu(service)

    await expand('编译')
    // One row per discovered command, named family + variant.
    expect(screen.getByRole('menuitem', { name: 'H5 · dev' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Flutter · android' })).toBeTruthy()
    // The family the standard names but this workspace cannot build is present
    // as a disabled note, not silently omitted.
    expect(screen.getByText(/鸿蒙/)).toBeTruthy()

    fireEvent.click(screen.getByRole('menuitem', { name: 'H5 · dev' }))
    expect(service.run).toHaveBeenCalledWith({
      cwd: '/w/alpha/apps/alpha-h5',
      script: 'build:dev',
      label: 'H5 · dev',
    })
  })

  it('explains the package gap when no family declares a package script', async () => {
    const service: AppBuildService = { describe: vi.fn(async () => CATALOG), run: vi.fn() }
    openMenu(service)

    await expand('打包')
    expect(screen.getByText(/没有独立打包脚本/)).toBeTruthy()
  })

  it('offers a real package command when a family declares one', async () => {
    const desktop: AppBuildFamily = {
      id: 'desktop',
      root: 'desktop',
      rootPath: '/w/alpha/apps/desktop',
      build: [command('build', 'default')],
      package: [command('package:win:x64', 'win · x64')],
    }
    const service: AppBuildService = {
      describe: vi.fn(async () => ({ cwd: '/w/alpha', families: [desktop], missing: [] })),
      run: vi.fn(),
    }
    openMenu(service)

    await expand('打包')
    fireEvent.click(screen.getByRole('menuitem', { name: '桌面端 · win · x64' }))
    expect(service.run).toHaveBeenCalledWith({
      cwd: '/w/alpha/apps/desktop',
      script: 'package:win:x64',
      label: '桌面端 · win · x64',
    })
  })

  it('refuses a command the host reported unrunnable, and says why', async () => {
    const service: AppBuildService = { describe: vi.fn(async () => CATALOG), run: vi.fn() }
    openMenu(service)

    await expand('编译')
    const ios = screen.getByRole('menuitem', { name: 'Flutter · ios · prod' })
    // The row is present (the gap stays visible) but disabled, carrying the
    // host's own reason — not a renderer-side guess about the platform.
    expect((ios as HTMLButtonElement).disabled).toBe(true)
    // The label is nested one level deep (the row's own label span wraps it),
    // so select the tooltip carrier by its attribute rather than by position.
    expect(ios.querySelector('span[title]')?.getAttribute('title')).toBe('需要 macOS 构建主机')
    fireEvent.click(ios)
    expect(service.run).not.toHaveBeenCalled()
  })

  it('shows no app-build rows without the service', () => {
    openMenu(undefined)
    expect(screen.queryByRole('menuitem', { name: '编译' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '打包' })).toBeNull()
    // The rest of the menu is unaffected.
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy()
  })

  it('shows no app-build rows when the probe answers nothing', async () => {
    const service: AppBuildService = { describe: vi.fn(async () => undefined), run: vi.fn() }
    openMenu(service)
    await vi.waitFor(() => { expect(service.describe).toHaveBeenCalled() })
    expect(screen.queryByRole('menuitem', { name: '编译' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy()
  })
})
