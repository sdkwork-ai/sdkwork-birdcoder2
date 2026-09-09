/** Behavior of the SDKWork composed backend: native pick delegation plus the real browse primitives over a temporary tree. */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerComposedCapability } from '../src/capability.ts'

const pickControl = vi.hoisted(() => ({ calls: 0, chosen: 'C:\\picked\\workspace' }))

// The chooser machinery opens a real OS dialog; the delegation contract is
// observable through the stubbed call instead.
vi.mock('@deepseek-ai/dsh-host-directory-picker-native', () => ({
  pickNativeDirectory: async () => {
    pickControl.calls += 1
    return pickControl.chosen
  },
}))

const { default: ComposedDirectoryPicker } = await import('../src/index.ts')

let root: string
let capability: DirectoryPickerComposedCapability
let dispose: () => Promise<void>

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-composed-'))
  await mkdir(join(root, 'projects'))
  await writeFile(join(root, 'app.json'), '{"kind":"sdkwork.app"}')
  await writeFile(join(root, 'big.txt'), 'x'.repeat(64))

  const ctx = new Context()
  // A tight text bound so the fence below is observable: the config flows
  // through the inherited static Config schema (cordis validates it before
  // constructing), exactly the path a Loader entry mount takes.
  const fiber = ctx.plugin(ComposedDirectoryPicker, { maxEntries: 1000, maxTextBytes: 32 })
  await fiber.await()
  const picked = ctx.get('directoryPicker')!.capability()
  if (picked.kind !== 'composed') throw new Error('composed backend must advertise the composed capability')
  capability = picked
  dispose = () => fiber.dispose()
})

afterAll(async () => {
  await dispose()
  await rm(root, { recursive: true, force: true })
})

describe('ComposedDirectoryPicker', () => {
  it('serves the merged capability and delegates pick to the native chooser machinery', async () => {
    expect(capability.kind).toBe('composed')
    const before = pickControl.calls
    await expect(capability.pick(new AbortController().signal)).resolves.toBe(pickControl.chosen)
    expect(pickControl.calls).toBe(before + 1)
  })

  it('serves the browse primitives over the real filesystem', async () => {
    const listing = await capability.list(root)
    expect(listing.path).toBe(root)
    expect(listing.entries.map(entry => entry.name)).toContain('projects')
    expect(await capability.readTextFile(join(root, 'app.json'), new AbortController().signal))
      .toBe('{"kind":"sdkwork.app"}')
  })

  it('keeps the browse fences: relative paths and over-bound reads are refused with typed codes', async () => {
    const relative = await capability.readTextFile('app.json').catch((error: unknown) => error)
    expect(relative).toBeInstanceOf(DirectoryPickerError)
    expect((relative as DirectoryPickerError).code).toBe('file-unreadable')

    const tooLarge = await capability.readTextFile(join(root, 'big.txt')).catch((error: unknown) => error)
    expect(tooLarge).toBeInstanceOf(DirectoryPickerError)
    expect((tooLarge as DirectoryPickerError).code).toBe('file-too-large')
  })

  it('serves governed text writes end to end', async () => {
    const written = await capability.writeTextFile(join(root, 'out.json'), '{"schemaVersion":3}')
    expect(written).toBe(join(root, 'out.json'))
    await expect(capability.readTextFile(join(root, 'out.json'))).resolves.toBe('{"schemaVersion":3}')
  })
})
