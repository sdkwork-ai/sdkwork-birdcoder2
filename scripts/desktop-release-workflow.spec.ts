/**
 * Desktop release lane contract.
 *
 * The release used to be one matrix job, so a single platform failure re-ran
 * every target and the run summary named no attributable job. Each target is now
 * its own job calling `desktop-package-target.yml`: these assertions keep the
 * target table, the runner and directory each lane uses, the selection that
 * repackages a subset, and the artifact names the release assembly reads from
 * drifting apart.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { DESKTOP_TARGET_NAMES } from '../apps/desktop/scripts/desktop-build-paths.mjs'
import { desktopReleaseArtifacts } from './release/assemble-github-release.ts'

const root = resolve(import.meta.dirname, '..')
const TARGET_WORKFLOW = '.github/workflows/desktop-package-target.yml'
const RELEASE_WORKFLOW = '.github/workflows/desktop-release.yml'

/** Runner label each lane must stay on: the packaged runtime has to execute natively. */
const RUNNERS: Readonly<Record<string, string>> = {
  'win-x64': 'windows-2025',
  'win-arm64': 'windows-11-arm',
  'mac-x64': 'macos-15-intel',
  'mac-arm64': 'macos-15',
  'linux-x64': 'ubuntu-24.04',
  'linux-arm64': 'ubuntu-24.04-arm',
}

/** Lanes whose MAX_PATH conversion needs the short build root; nothing else overrides it. */
const BUILD_ROOTS: Readonly<Record<string, string>> = { 'win-x64': 'D:/b', 'win-arm64': 'C:/b' }

/** Platform release settings each preflighted lane materializes; the Linux lanes read none. */
const ENV_FILES: Readonly<Record<string, string>> = {
  'win-x64': 'packaging/windows.env',
  'win-arm64': 'packaging/windows.env',
  'mac-x64': 'packaging/macos.env',
  'mac-arm64': 'packaging/macos.env',
}

const ARTIFACT_OS: Readonly<Record<string, string>> = { win: 'windows', mac: 'macos', linux: 'linux' }

interface Workflow {
  readonly on?: Record<string, unknown>
  readonly permissions?: Record<string, unknown>
  readonly jobs?: Record<string, Job>
}

interface Job {
  readonly name?: string
  readonly needs?: string | readonly string[]
  readonly if?: string
  readonly uses?: string
  readonly with?: Record<string, unknown>
  readonly secrets?: unknown
  readonly strategy?: unknown
  readonly outputs?: Record<string, string>
  readonly env?: Record<string, string>
  readonly 'runs-on'?: unknown
  readonly 'timeout-minutes'?: number
  readonly steps?: readonly Step[]
}

interface Step {
  readonly id?: string
  readonly name?: string
  readonly uses?: string
  readonly if?: string
  readonly with?: Record<string, unknown>
  readonly run?: string
}

function loadWorkflow(path: string): Workflow {
  const document: unknown = yaml.load(readFileSync(resolve(root, path), 'utf8'))
  if (typeof document !== 'object' || document === null) throw new TypeError(`${path} must define a workflow`)
  return document as Workflow
}

function job(workflow: Workflow, id: string): Job {
  const selected = workflow.jobs?.[id]
  if (selected === undefined) throw new TypeError(`missing job ${id}`)
  return selected
}

function workflowCall(workflow: Workflow, key: 'inputs' | 'secrets'): Record<string, unknown> {
  const call = workflow.on?.workflow_call
  if (typeof call !== 'object' || call === null) throw new TypeError('workflow must be callable')
  const mapping = (call as Record<string, unknown>)[key]
  if (typeof mapping !== 'object' || mapping === null) throw new TypeError(`workflow_call.${key} must be a mapping`)
  return mapping as Record<string, unknown>
}

function expectedArtifact(target: string): string {
  const [os, arch] = target.split('-')
  return `dsh-desktop-${ARTIFACT_OS[os ?? ''] ?? os}-${arch}`
}

function expectedArtifactsDir(target: string): string {
  const buildRoot = BUILD_ROOTS[target]
  return buildRoot === undefined
    ? `apps/desktop/.desktop-build/targets/${target}/unsigned-artifacts`
    : `${buildRoot}/targets/${target}/unsigned-artifacts`
}

describe('Desktop release lanes', () => {
  const release = loadWorkflow(RELEASE_WORKFLOW)
  const laneJobs = Object.entries(release.jobs ?? {}).filter(([, value]) => value.uses !== undefined)

  it('gives every target its own job instead of one matrix entry', () => {
    expect(Object.keys(release.jobs ?? {}).sort())
      .toEqual(['resolve', ...DESKTOP_TARGET_NAMES.map(target => `package-${target}`)].sort())
    for (const [, value] of Object.entries(release.jobs ?? {})) expect(value.strategy).toBeUndefined()
    expect(laneJobs.map(([id]) => id).sort())
      .toEqual(DESKTOP_TARGET_NAMES.map(target => `package-${target}`).sort())
  })

  it('packages exactly the six targets the release assembly consumes', () => {
    expect([...DESKTOP_TARGET_NAMES].map(target => expectedArtifact(target)).sort())
      .toEqual([...desktopReleaseArtifacts()].sort())
    const desktop = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    for (const target of DESKTOP_TARGET_NAMES) {
      const lane = job(release, `package-${target}`)
      expect(lane.uses, target).toBe(`./${TARGET_WORKFLOW}`)
      expect(lane.name, target).toBe(`Package ${target}`)
      expect(lane.needs, target).toBe('resolve')
      expect(lane.secrets, target).toBe('inherit')
      expect(lane.with, target).toEqual({
        target,
        runner: RUNNERS[target],
        artifact: expectedArtifact(target),
        script: `package:${target.replace('-', ':')}:unsigned`,
        ...BUILD_ROOTS[target] === undefined ? {} : { 'build-root': BUILD_ROOTS[target] },
        'artifacts-dir': expectedArtifactsDir(target),
        ...ENV_FILES[target] === undefined ? {} : { 'env-file': ENV_FILES[target] },
        version: '${{ needs.resolve.outputs.version }}',
      })
      expect(desktop.scripts[`package:${target.replace('-', ':')}:unsigned`], target)
        .toBe(`tsx scripts/package-target.ts ${target} --unsigned`)
    }
  })

  it('repackages a subset through one validated selection', () => {
    const resolveJob = job(release, 'resolve')
    expect(resolveJob.needs).toBeUndefined()
    expect(resolveJob.steps?.find(step => step.id === 'selection')?.run)
      .toBe('node apps/desktop/scripts/resolve-desktop-release-selection.mjs')
    expect(workflowCall(release, 'inputs')).toMatchObject({
      version: { required: true, type: 'string' },
      targets: { required: false, type: 'string', default: 'all' },
    })
    expect(workflowCall(release, 'secrets')).toMatchObject({ SDKWORK_GITHUB_TOKEN: { required: false } })
    expect(Object.keys(release.on ?? {}).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
    for (const target of DESKTOP_TARGET_NAMES) {
      expect(job(release, `package-${target}`).if, target)
        .toBe(`contains(format(',{0},', needs.resolve.outputs.targets), ',${target},')`)
    }
  })

  it('reports the packaged version and the selected lanes as job outputs', () => {
    const outputs = job(release, 'resolve').outputs as Record<string, string> | undefined
    expect(outputs).toEqual({
      version: '${{ steps.selection.outputs.version }}',
      targets: '${{ steps.selection.outputs.targets }}',
    })
    const warning = job(release, 'resolve').steps?.find(step => step.if?.includes('partial'))
    expect(warning?.if).toBe("steps.selection.outputs.partial == 'true'")
    expect(warning?.run).toContain('requires all six targets')
  })

  it('runs one target in a reusable workflow with pinned actions', () => {
    const target = loadWorkflow(TARGET_WORKFLOW)
    expect(Object.keys(workflowCall(target, 'inputs')).sort()).toEqual([
      'artifact', 'artifacts-dir', 'build-root', 'env-file', 'runner', 'script', 'target', 'version',
    ])
    expect(workflowCall(target, 'secrets')).toMatchObject({ SDKWORK_GITHUB_TOKEN: { required: false } })
    expect(target.permissions).toEqual({ contents: 'read' })
    const lane = job(target, 'package')
    expect(lane['runs-on']).toBe('${{ inputs.runner }}')
    expect(lane.name).toBe('Package ${{ inputs.target }}')
    expect(lane['timeout-minutes']).toBe(90)
    expect(lane.strategy).toBeUndefined()
    const steps = lane.steps ?? []
    for (const pin of ['actions/checkout@v7.0.1', 'actions/setup-node@v7.0.0',
      'actions/upload-artifact@v7.0.1', 'actions/cache@v6.1.0', 'pnpm/action-setup@v5.0.0']) {
      expect(steps.some(step => step.uses === pin), pin).toBe(true)
    }
    // The download cache and the upload run on every target: one keeps a retry
    // from downloading Electron and the runtime payload again, the other carries
    // the artifact name the release assembly reads. The cache directory names
    // `runner.temp`, which the expression engine only exposes at job level.
    expect(lane.env).toMatchObject({ DSH_DESKTOP_PACKAGE_CACHE_DIR: '${{ runner.temp }}/dsh-desktop-package-cache' })
    expect(steps.find(step => step.uses === 'actions/cache@v6.1.0')?.with)
      .toMatchObject({ path: '${{ env.DSH_DESKTOP_PACKAGE_CACHE_DIR }}' })
    expect(steps.find(step => step.uses === 'actions/upload-artifact@v7.0.1')?.with)
      .toMatchObject({ name: '${{ inputs.artifact }}', 'if-no-files-found': 'error' })
    expect(JSON.stringify(target)).not.toContain('matrix')
    expect(JSON.stringify(release)).not.toContain('matrix')
  })
})
