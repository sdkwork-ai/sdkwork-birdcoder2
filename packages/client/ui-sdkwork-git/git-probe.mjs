import { JSDOM } from 'jsdom'
import React from 'react'
import { render, act } from '@testing-library/react'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
if (!globalThis.IS_REACT_ACT_ENVIRONMENT) globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { GitBranchPill } = await import('./src/client/GitBranchPill.tsx')
const { en } = await import('./src/client/locales.ts')

console.log('Imported GitBranchPill:', typeof GitBranchPill)

const REPO = 'E:/workspace/bird'
const SESSION = 's1'

const fakeGit = {
  status: async () => ({ branch: 'main', commit: 'a'.repeat(40), dirtyCount: 0, ahead: 0, behind: 0, additions: 0, deletions: 0 }),
  branches: async () => ({ current: 'main', branches: [{ name: 'main', current: true, commit: 'b'.repeat(40) }] }),
  checkout: async (_c, b) => b,
  createAndCheckout: async (_c, n) => n,
  commit: async () => ({ commit: 'd'.repeat(40), branch: 'main' }),
  push: async () => ({ branch: 'main', upstream: 'origin/main' }),
  log: async () => [],
}

const useSessions = (select) => select({ byId: { [SESSION]: { cwd: REPO } } })

// Minimal translate: en[key], with count interpolation like makeTranslate.
const t = (key, vars) => {
  let text = en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}

const props = {
  sessionId: SESSION,
  useSessions,
  git: fakeGit,
  t,
}

await act(async () => {
  render(React.createElement(GitBranchPill, props))
  await new Promise(r => setTimeout(r, 100))
})

// Poll until the button appears or timeout.
const deadline = Date.now() + 3000
let found = false
while (Date.now() < deadline) {
  const btn = document.body.querySelector(`button[aria-label="${en['pill.openAria']}"]`)
  if (btn) {
    console.log('RESULT: Found branch pill button:', true)
    console.log('RESULT: Label:', btn.textContent)
    found = true
    break
  }
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })
}
if (!found) {
  console.log('RESULT: Found branch pill button:', false)
  console.log('RESULT: body HTML:', document.body.innerHTML.slice(0, 500))
}
