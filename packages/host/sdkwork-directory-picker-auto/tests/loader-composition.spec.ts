/**
 * REAL-composition coverage for the SDKWork chooser: a test-only cordis.yml
 * booted through the vendored Loader mounts the webserver row plus the fork
 * chooser, and the assertions observe which backend and surface entries were
 * mounted — the composed backend (native pick + browse primitives) on an
 * attended host, the plain browse pair for remote clients — and that disposal
 * removes the mounted entries again (HMR safety).
 */

import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import HttpServer from '@deepseek-ai/dsh-host-webserver'
import type { DirectoryPicker } from '@deepseek-ai/dsh-host-directory-picker'
import BrowseDirectoryPicker from '@deepseek-ai/dsh-host-directory-picker-browse'
import ComposedDirectoryPicker from '@deepseek-ai/dsh-sdkwork-directory-picker-composed'
import * as SdkworkDirectoryPickerAuto from '../src/index.ts'

// The chooser machinery opens a real OS dialog; composition observes the
// mounting decision, not a pick.
vi.mock('@deepseek-ai/dsh-host-directory-picker-native', () => ({
  pickNativeDirectory: vi.fn(async () => null),
}))

const AUTO = '@deepseek-ai/dsh-sdkwork-directory-picker-auto'
const COMPOSED = '@deepseek-ai/dsh-sdkwork-directory-picker-composed'
const BROWSE = '@deepseek-ai/dsh-host-directory-picker-browse'
const NATIVE_SURFACE = '@deepseek-ai/dsh-client-ui-directory-picker-native'
const BROWSE_SURFACE = '@deepseek-ai/dsh-client-ui-directory-picker-browse'

/** Loader-visible stand-in for a client surface package (see the upstream spec's rationale). */
function surfaceModule(name: string): unknown {
  return { name, apply: () => undefined }
}

let root: string | undefined
let fakeBin: string | undefined
let context: Context | undefined

afterEach(async () => {
  vi.unstubAllEnvs()
  await context?.fiber.dispose()
  context = undefined
  for (const dir of [root, fakeBin]) {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  }
  root = undefined
  fakeBin = undefined
})

/** Write a two-row cordis.yml (webserver + chooser), then boot it through the real Loader. */
async function loadComposition(bindHost: '127.0.0.1' | '0.0.0.0'): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-sdkwork-picker-auto-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    `    host: '${bindHost}'`,
    '    port: 0',
    `- name: '${AUTO}'`,
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', HttpServer],
    [AUTO, SdkworkDirectoryPickerAuto],
    [COMPOSED, ComposedDirectoryPicker],
    [BROWSE, BrowseDirectoryPicker],
    [NATIVE_SURFACE, surfaceModule(NATIVE_SURFACE)],
    [BROWSE_SURFACE, surfaceModule(BROWSE_SURFACE)],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

/** Entry names currently present in the loader store (root tree plus subtrees). */
function entryNames(ctx: Context): string[] {
  return [...ctx.loader.entries()].map(entry => entry.options.name)
}

/**
 * Force every signal of an attended host on any platform: no SSH launch, a
 * display, and a PATH holding one executable chooser binary so the real
 * probe resolves identically on hosts with and without zenity/kdialog.
 */
function stubAttendedHost(): void {
  fakeBin = mkdtempSync(join(tmpdir(), 'dsh-picker-bin-'))
  const zenity = join(fakeBin, 'zenity')
  writeFileSync(zenity, '#!/bin/sh\n')
  chmodSync(zenity, 0o755)
  vi.stubEnv('PATH', fakeBin)
  vi.stubEnv('SSH_CONNECTION', '')
  vi.stubEnv('SSH_TTY', '')
  vi.stubEnv('DISPLAY', ':0')
}

describe('sdkwork chooser real Loader composition', () => {
  // The budget covers this file's static imports (webserver plus the backend
  // node halves through tsx), which dominate on cold caches.
  it('mounts the composed backend and the native surface for an attended loopback host', { timeout: 60_000 }, async () => {
    stubAttendedHost()
    const ctx = await loadComposition('127.0.0.1')

    expect(entryNames(ctx)).toContain(COMPOSED)
    expect(entryNames(ctx)).toContain(NATIVE_SURFACE)
    expect(entryNames(ctx)).not.toContain(BROWSE)
    expect(entryNames(ctx)).not.toContain(BROWSE_SURFACE)
    const picker = ctx.get('directoryPicker') as DirectoryPicker
    // The whole point of the fork chooser: an attended boot keeps serving the
    // governed browse verbs (readTextFile et al.) beside the OS chooser.
    expect(picker.capability().kind).toBe('composed')

    // HMR safety: disposing the chooser's fiber removes the entries it created.
    const autoEntry = [...ctx.loader.entries()].find(entry => entry.options.name === AUTO)!
    await autoEntry.fiber!.dispose()
    expect(entryNames(ctx)).not.toContain(COMPOSED)
    expect(entryNames(ctx)).not.toContain(NATIVE_SURFACE)
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })

  it('mounts the plain browse pair under an SSH launch', { timeout: 60_000 }, async () => {
    stubAttendedHost()
    vi.stubEnv('SSH_CONNECTION', '10.0.0.2 55 10.0.0.9 22')
    const ctx = await loadComposition('127.0.0.1')

    expect(entryNames(ctx)).toContain(BROWSE)
    expect(entryNames(ctx)).toContain(BROWSE_SURFACE)
    expect(entryNames(ctx)).not.toContain(COMPOSED)
    expect(entryNames(ctx)).not.toContain(NATIVE_SURFACE)
    const picker = ctx.get('directoryPicker') as DirectoryPicker
    expect(picker.capability().kind).toBe('browse')
  })

  it('mounts the plain browse pair for an all-interfaces bind even on an attended host', { timeout: 60_000 }, async () => {
    stubAttendedHost()
    const ctx = await loadComposition('0.0.0.0')

    expect(entryNames(ctx)).toContain(BROWSE)
    expect(entryNames(ctx)).toContain(BROWSE_SURFACE)
    expect(entryNames(ctx)).not.toContain(COMPOSED)
  })
})
