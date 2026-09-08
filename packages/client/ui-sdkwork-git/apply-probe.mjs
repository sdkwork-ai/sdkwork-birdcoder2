import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { Context } = await import('@deepseek-ai/cordis')
const { SlotRegistry } = await import('@deepseek-ai/dsh-client-ui-renderer/client')
const { apply: applyLocale, inject: localeInject } = await import('@deepseek-ai/dsh-client-locale/client')
const { apply, inject } = await import('./src/client/index.ts')
const { stubSettingsScope } = await import('@deepseek-ai/dsh-client-test-runtime')

/** Build a full client bench with optional remote.sdkworkGit. */
async function bench(withGitNamespace) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  }, () => null)
  ctx.provide('sessions', {})
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false })
  const stubNamespace = {}
  ctx.provide('remote', { $on: () => () => {}, sdkworkGit: withGitNamespace ? stubNamespace : undefined })
  if (withGitNamespace) ctx.provide('remote.sdkworkGit', stubNamespace)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope })
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  const entries = ctx.slots.entries('conversation.session.header.utilities')
  return { count: entries.length, ctx, fiber }
}

console.log('=== Scenario A: remote.sdkworkGit PRESENT ===')
const a = await bench(true)
console.log('utilities entries:', a.count)

console.log('')
console.log('=== Scenario B: remote.sdkworkGit ABSENT ===')
const b = await bench(false)
console.log('utilities entries:', b.count)
