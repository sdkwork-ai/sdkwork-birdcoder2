import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TABLET_HOST_CAPABILITIES } from '../../packages/sdkwork-birdcoder2-pad-tauri/src/host/capabilities'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const specPath = path.join(appRoot, 'specs', 'tablet-adaptation.spec.json')

interface TabletAdaptationSpec {
  readonly schemaVersion: number
  readonly applicationCode: string
  readonly runtimeTargets: readonly string[]
  readonly windowClasses: Record<string, { supported: boolean; minWidth: number; layout: string }>
  readonly orientations: readonly string[]
  readonly multitasking: Record<string, boolean>
  readonly input: Record<string, boolean>
  readonly capabilities: readonly string[]
  readonly testMatrix: readonly {
    runtimeTarget: string
    windowClass: string
    orientation: string
    multitasking: string
  }[]
  readonly evidence: { screenshots: string; tests: string }
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as TabletAdaptationSpec

const WINDOW_CLASSES = ['compact', 'medium', 'expanded', 'large'] as const
const ORIENTATIONS = ['portrait', 'landscape'] as const
const RUNTIME_TARGETS = ['tablet-ipados', 'tablet-android'] as const
const CAPABILITIES = new Set([
  'multitasking',
  'externalDisplay',
  'windowControls',
  'keyboardShortcuts',
  'stylus',
  'filePicker',
  'shareSheet',
  'camera',
  'qrScanner',
  'secureStorage',
  'pushNotifications',
  'biometric',
  'networkStatus',
  'appLifecycle',
  'clipboard',
  'deepLinks',
])

describe('tablet adaptation contract', () => {
  it('is a schema version 1 contract for this application root', () => {
    expect(spec.schemaVersion).toBe(1)
    expect(spec.applicationCode).toBe('birdcoder2')
  })

  it('ships only tablet runtime targets', () => {
    expect([...spec.runtimeTargets].sort()).toEqual([...RUNTIME_TARGETS].sort())
    for (const target of spec.runtimeTargets) {
      expect(target.startsWith('tablet-')).toBe(true)
    }
  })

  it('supports all four window classes with ascending breakpoints', () => {
    const windowClassSpec = (windowClass: string) => {
      const entry = spec.windowClasses[windowClass]
      expect(entry).toBeDefined()
      return entry as { supported: boolean; minWidth: number; layout: string }
    }
    const widths = WINDOW_CLASSES.map(windowClass => windowClassSpec(windowClass).minWidth)
    expect(widths).toEqual([320, 600, 840, 1200])
    for (const windowClass of WINDOW_CLASSES) {
      expect(windowClassSpec(windowClass).supported).toBe(true)
      expect(windowClassSpec(windowClass).layout.length).toBeGreaterThan(0)
    }
  })

  it('supports portrait and landscape without an orientation lock', () => {
    expect([...spec.orientations].sort()).toEqual([...ORIENTATIONS].sort())
  })

  it('claims the required multitasking modes', () => {
    expect(spec.multitasking.splitView).toBe(true)
    expect(spec.multitasking.slideOver).toBe(true)
    expect(spec.multitasking.androidFreeform).toBe(true)
    expect(spec.multitasking.externalDisplay).toBe(false)
    expect(typeof spec.multitasking.stageManager).toBe('boolean')
  })

  it('requires touch, pointer, and hardware keyboard input', () => {
    expect(spec.input.touch).toBe(true)
    expect(spec.input.pointer).toBe(true)
    expect(spec.input.hardwareKeyboard).toBe(true)
    expect(spec.input.stylus).toBe(false)
  })

  it('declares a capability set the host actually provides', () => {
    expect(new Set(spec.capabilities).size).toBe(spec.capabilities.length)
    for (const capability of spec.capabilities) {
      expect(CAPABILITIES.has(capability)).toBe(true)
    }
    expect(spec.capabilities).toContain('secureStorage')
    expect([...TABLET_HOST_CAPABILITIES].sort()).toEqual([...spec.capabilities].sort())
  })

  it('covers every target, window class, and orientation in the test matrix', () => {
    for (const target of spec.runtimeTargets) {
      const rows = spec.testMatrix.filter(row => row.runtimeTarget === target)
      expect(rows.length).toBeGreaterThan(0)
      for (const windowClass of WINDOW_CLASSES) {
        expect(rows.some(row => row.windowClass === windowClass)).toBe(true)
      }
      for (const orientation of ORIENTATIONS) {
        expect(rows.some(row => row.orientation === orientation)).toBe(true)
      }
    }
  })

  it('covers full-screen and every claimed multitasking mode', () => {
    const modes = new Set(spec.testMatrix.map(row => row.multitasking))
    expect(modes.has('full-screen')).toBe(true)
    if (spec.multitasking.splitView) expect(modes.has('split-view')).toBe(true)
    if (spec.multitasking.slideOver) expect(modes.has('slide-over')).toBe(true)
    if (spec.multitasking.stageManager) expect(modes.has('stage-manager')).toBe(true)
    if (spec.multitasking.androidFreeform) expect(modes.has('freeform')).toBe(true)
  })

  it('points evidence at tracked directories', () => {
    for (const relative of [spec.evidence.screenshots, spec.evidence.tests]) {
      const resolved = path.resolve(appRoot, relative)
      expect(resolved.startsWith(appRoot)).toBe(true)
      expect(fs.statSync(resolved).isDirectory()).toBe(true)
    }
  })
})
