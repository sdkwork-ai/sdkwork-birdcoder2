/**
 * Reusable-workflow call contracts.
 *
 * A reusable workflow receives no secrets unless its caller names them, and it
 * accepts only the inputs and secrets its `on.workflow_call` block declares. A
 * fork step added inside a called workflow therefore breaks at run time when
 * every caller still calls it the old way — which is exactly how the SDKWork
 * sibling clone silently lost its token. These assertions keep that class of
 * defect at the workflow-definition level instead of on a release runner.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const workflowDirectory = resolve(root, '.github/workflows')

interface ReusableCall {
  readonly caller: string
  readonly job: string
  readonly callee: string
  readonly jobValue: Record<string, unknown>
}

describe('Reusable workflow calls', () => {
  it('exists for every job-level `uses`', () => {
    const names = workflowNames()
    const missing: string[] = []
    for (const call of reusableCalls()) {
      if (!names.includes(call.callee)) {
        missing.push(`${shortName(call.caller)} job '${call.job}' calls missing workflow ${call.callee}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('passes every input the callee declares, and no input it does not', () => {
    const violations: string[] = []
    for (const call of reusableCalls()) {
      const callee = loadWorkflow(call.callee)
      const declared = workflowCallMapping(callee, 'inputs')
      const passed = isRecord(call.jobValue.with) ? call.jobValue.with : {}

      for (const name of Object.keys(passed)) {
        if (!(name in declared)) {
          violations.push(
            `${shortName(call.caller)} job '${call.job}' passes unknown input '${name}' to ${shortName(call.callee)}`,
          )
        }
      }
      for (const [name, specification] of Object.entries(declared)) {
        if (isRecord(specification) && specification.required === true && !(name in passed)) {
          violations.push(
            `${shortName(call.caller)} job '${call.job}' omits required input '${name}' of ${shortName(call.callee)}`,
          )
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('passes every secret the callee reads, and only secrets it declares', () => {
    const violations: string[] = []
    for (const call of reusableCalls()) {
      // `secrets: inherit` forwards the caller's whole context, so nothing can be missing.
      if (call.jobValue.secrets === 'inherit') continue
      const callee = loadWorkflow(call.callee)
      const passed = isRecord(call.jobValue.secrets) ? new Set(Object.keys(call.jobValue.secrets)) : new Set<string>()

      for (const name of [...secretsRead(loadWorkflowText(call.callee))].sort()) {
        if (!passed.has(name)) {
          violations.push(
            `${shortName(call.caller)} job '${call.job}' does not pass secrets.${name} that ${shortName(call.callee)} reads`,
          )
        }
      }
      for (const name of passed) {
        if (!(name in workflowCallMapping(callee, 'secrets'))) {
          violations.push(
            `${shortName(call.caller)} job '${call.job}' passes secrets.${name} that ${shortName(call.callee)} does not declare`,
          )
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('reads its own secrets through a declared contract when it is callable', () => {
    const violations: string[] = []
    for (const path of workflowNames()) {
      const workflow = loadWorkflow(path)
      if (!isRecord(workflow.on) || !isRecord(workflow.on.workflow_call)) continue
      const declared = workflowCallMapping(workflow, 'secrets')
      for (const secret of [...secretsRead(loadWorkflowText(path))].sort()) {
        // The automatic token is available to every called workflow.
        if (secret === 'github_token') continue
        if (!(secret in declared)) violations.push(`${shortName(path)} reads secrets.${secret} without declaring it`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('Job graph references', () => {
  it('names a declared output for every `needs.<job>.outputs.<name>`', () => {
    const violations: string[] = []
    for (const path of workflowNames()) {
      const workflow = loadWorkflow(path)
      const jobs = isRecord(workflow.jobs) ? workflow.jobs : {}
      for (const [job, value] of Object.entries(jobs)) {
        for (const reference of dump(value).matchAll(/needs\.([\w-]+)\.outputs\.([\w-]+)/gu)) {
          const dependency = jobs[reference[1] ?? '']
          const output = reference[2] ?? ''
          const declared = isRecord(dependency) && isRecord(dependency.outputs) ? Object.keys(dependency.outputs) : []
          if (!declared.includes(output)) {
            violations.push(
              `${shortName(path)} job '${job}' reads needs.${reference[1]}.outputs.${output}, which is not declared`,
            )
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('references only step ids that exist, and declares none twice', () => {
    const violations: string[] = []
    for (const path of workflowNames()) {
      const workflow = loadWorkflow(path)
      const jobs = isRecord(workflow.jobs) ? workflow.jobs : {}
      for (const [job, value] of Object.entries(jobs)) {
        if (!isRecord(value) || !Array.isArray(value.steps)) continue
        const ids = value.steps
          .filter(isRecord)
          .map(step => step.id)
          .filter((id): id is string => typeof id === 'string')
        for (const id of ids) {
          if (ids.filter(candidate => candidate === id).length > 1) {
            violations.push(`${shortName(path)} job '${job}' declares step id '${id}' more than once`)
          }
        }
        for (const reference of dump(value).matchAll(/steps\.([\w-]+)\./gu)) {
          const id = reference[1]
          if (id !== 'job' && !ids.includes(id ?? '')) {
            violations.push(`${shortName(path)} job '${job}' references steps.${id}, which no step declares`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })
})

function reusableCalls(): ReusableCall[] {
  const calls: ReusableCall[] = []
  for (const caller of workflowNames()) {
    const workflow = loadWorkflow(caller)
    if (!isRecord(workflow.jobs)) continue
    for (const [job, value] of Object.entries(workflow.jobs)) {
      if (!isRecord(value) || typeof value.uses !== 'string' || !value.uses.startsWith('./')) continue
      calls.push({ caller, job, callee: value.uses.slice(2), jobValue: value })
    }
  }
  return calls
}

function workflowCallMapping(workflow: Record<string, unknown>, key: 'inputs' | 'secrets'): Record<string, unknown> {
  if (!isRecord(workflow.on) || !isRecord(workflow.on.workflow_call)) return {}
  const block = workflow.on.workflow_call[key]
  return isRecord(block) ? block : {}
}

function secretsRead(text: string): Set<string> {
  return new Set([...text.matchAll(/secrets\.([\w-]+)/gu)].flatMap(match => (match[1] === undefined ? [] : [match[1]])))
}

function loadWorkflowText(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

function loadWorkflow(path: string): Record<string, unknown> {
  const document: unknown = yaml.load(loadWorkflowText(path))
  if (!isRecord(document)) throw new TypeError(`${path} must define a workflow`)
  return document
}

/** Repository-relative paths of every workflow file, sorted. */
function workflowNames(): string[] {
  return readdirSync(workflowDirectory)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => `.github/workflows/${name}`)
    .sort()
}

function shortName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function dump(value: unknown): string {
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
