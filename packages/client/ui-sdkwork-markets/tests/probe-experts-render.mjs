/**
 * End-to-end probe: load the REBUILT ui-sdkwork-markets bundle (lib/client.js,
 * the exact artifact the plugin loader serves) inside jsdom and render the
 * Experts market page through the bundle's own component stack. The bug this
 * probe guards: ExpertsSearchBar/ExpertCard call useNavigate() inside the
 * embedded AppstoreMarketsSurface; when the bundle carried two react-router
 * copies the MemoryRouter's context was invisible to the experts components
 * and the surface crashed with "useNavigate() may be used only in the context
 * of a <Router> component." Success = the experts page renders (search bar,
 * banner, cards) with no useNavigate invariant error.
 *
 * Run: ../../../node_modules/.bin/tsx --tsconfig <root>/tsconfig.base.client.json tests/probe-experts-render.mjs
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

// 1. CSS imports inside the plugin sources: serve bytes through a data URL so
//    Node's ESM loader never touches the filesystem for stylesheets.
const CSS_RE = /\.module\.css$|\.css$/
registerHooks({
  resolve(specifier, context, next) {
    if (CSS_RE.test(specifier) && !specifier.startsWith('\0')) {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true }
    }
    return next(specifier, context)
  },
})

// 2. jsdom as the global window before React loads.
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://fixture.local/',
  pretendToBeVisual: true,
})
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'customElements', 'location', 'history', 'localStorage', 'sessionStorage']) {
  if (dom.window[key] !== undefined) globalThis[key] = dom.window[key]
}
// navigator has a getter-only global in Node 21+; patch in place.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 3. Minimal module-loader stand-in: the bundle's factory takes a `require`
//    resolving exactly the externals the artifact keeps.
const marketsPkg = 'E:/sdkwork-space/sdkwork-birdcoder2/packages/client/ui-sdkwork-markets/package.json'
const { createRequire } = await import('node:module')
const pkgRequire = createRequire(marketsPkg)
const moduleTable = {
  'react': () => pkgRequire('react'),
  'react/jsx-runtime': () => pkgRequire('react/jsx-runtime'),
  'react-dom/client': () => pkgRequire('react-dom/client'),
  '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager': () => ({
    getSdkworkGlobalTokenManager: () => new Proxy({
      getAccessToken: () => undefined,
      getRefreshToken: () => undefined,
      setTokens: () => {},
      clearTokens: () => {},
      hasAccessToken: () => false,
      subscribe: () => () => {},
    }, {
      // The SDKWork runtime probes a wide TokenManager surface; answer every
      // unknown member with an inert value so the probe focuses on routing.
      get(target, prop) {
        if (prop in target) return target[prop]
        return () => undefined
      },
    }),
  }),
}
const requireFromTable = (specifier) => {
  const row = moduleTable[specifier]
  if (row === undefined) throw new Error(`probe module table cannot answer: ${specifier}`)
  return row()
}

// 4. Load the built artifact (the real deliverable, not the TS sources).
globalThis.window.__ModuleLoader__ = {
  loaded: new Map(),
  load({ id, factory }) {
    const mod = factory(requireFromTable)
    this.loaded.set(id, mod)
    return mod
  },
}
const bundleUrl = pathToFileURL('E:/sdkwork-space/sdkwork-birdcoder2/packages/client/ui-sdkwork-markets/lib/client.js').href
await import(bundleUrl)
const plugin = globalThis.window.__ModuleLoader__.loaded.get('@deepseek-ai/dsh-client-ui-sdkwork-markets')
if (plugin === undefined) throw new Error('bundle factory did not register the plugin module')
console.log('[probe] bundle factory executed, exports:', Object.keys(plugin))

const React = pkgRequire('react')
const { createElement } = React
const { act } = await import('react')
const { createRoot } = pkgRequire('react-dom/client')

// 5. Drive the bundle's own apply() with a cordis-shaped context double so the
//    module-internal configureMarketsHost runs inside the artifact (calling a
//    source-module MarketsApp instead would build a second router graph and
//    prove nothing about the bundle). apply() registers slots that need full
//    cordis services, so anything past the adapter setup throws — that is
//    fine: the adapter is configured synchronously before those lines.
const listeners = new Set()
const subscribeIn = (l) => { listeners.add(l); return () => { listeners.delete(l) } }
const fixtureEnv = {
  apiBaseUrl: () => 'https://fixture.example',
  accessToken: () => '',
  subscribe: subscribeIn,
}
const fixtureIam = { controller: { getState: () => ({ session: null }), subscribe: subscribeIn } }
const fixtureLocale = {
  getSnapshot: () => ({ active: 'zh' }),
  subscribe: subscribeIn,
  bind: () => ((key) => key),
}
const fixtureThemeRuntime = { getTheme: () => ({ active: { colorScheme: 'light' } }) }
// Capture the registered mode.page component so the probe renders the bundle's
// own MarketsPage (the component stack that owns MarketsSurfaceBoundary +
// MarketsApp + the embedded AppstoreMarketsSurface).
let registeredPage = null
const ctxDouble = new Proxy({
  effect: () => () => {},
  locale: fixtureLocale,
  get: (key) => (key === 'theme' ? fixtureThemeRuntime : key === 'env' ? fixtureEnv : key === 'iam' ? fixtureIam : undefined),
  on: () => () => {},
  slots: {
    inject: (_seat, fn) => { fn() },
    register: (_declaration, component) => {
      registeredPage = component
      return { declaration: _declaration }
    },
  },
  layout: { openPanel: () => {} },
  sessions: { list: { getSnapshot: () => ({ current: undefined }) } },
  workspaces: { startSession: () => {} },
  remote: { pluginInventory: { list: async () => ({ ok: true, value: { entries: [] } }) } },
  settingsScope: {
    describe: () => ({ ensure: () => {}, getSnapshot: () => ({ view: { namespaces: [] } }) }),
  },
}, {
  get(target, prop) {
    if (prop in target) return target[prop]
    // Any further cordis service access (layout/sessions/remote/…) aborts the
    // probe's apply through a throw we catch below.
    return () => { throw new Error(`probe ctx double cannot answer: ${String(prop)}`) }
  },
})
let applyError = null
try {
  plugin.apply(ctxDouble)
} catch (error) {
  applyError = error
}
console.log('[probe] apply() ran on the bundle; stopped at:', applyError === null ? 'no error (full success)' : applyError.message)
if (registeredPage === null) throw new Error('apply() never registered the mode.page component')

const t = (key) => key
const root = createRoot(document.getElementById('root'))
const errors = []
const origError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args) }

// 6. Render the bundle's own MarketsPage with the Experts tab active. The tab
//    buttons are keyed by their verbatim label key; clicking the experts tab
//    mounts MarketsApp -> AppstoreMarketsSurface -> ExpertsPage (the stack
//    that threw before the fix).
let rendered = false
try {
  await act(async () => {
    root.render(createElement(registeredPage, {
      mode: 'markets',
      t,
      dispatchPrompt: () => {},
      listPlugins: async () => ({ entries: [] }),
      settingsTarget: () => ({ configurable: false }),
      onConfigure: () => {},
    }))
    rendered = true
  })
  // Click the Experts tab (second tab: plugins, experts, skills, connectors).
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
  const expertsTab = tabs.find(el => el.textContent === 'tab.experts')
  console.log('[probe] tabs rendered:', tabs.length, 'experts tab found:', expertsTab !== undefined)
  await act(async () => {
    expertsTab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 400))
  })
} catch (error) {
  errors.push(`render threw: ${error.message}`)
}

const html = document.getElementById('root').innerHTML
const navigateErrors = errors.filter(e => e.includes('useNavigate() may be used only'))
const crashed = html.includes('surface.error') || html.includes('data-markets-empty="crashed"')
const expertsPanelMounted = html.includes('data-markets-tab="experts"')
// The embedded surface translates its own i18n keys at runtime, so verbatim
// dictionary keys never appear in the DOM; assert on structural markers:
// the crash-report component's (ExpertsSearchBar) search input + lab button,
// and the card grid nodes.
const surfaceStart = html.indexOf('data-markets-tab="experts"')
const panelHtml = html.slice(surfaceStart)
const hasSearchInput = /<input[^>]*type="text"/.test(panelHtml)
const hasLabButton = /rounded-2xl bg-indigo-600/.test(panelHtml)
const expertCards = (panelHtml.match(/w-10 h-10|w-12 h-12 rounded/g) ?? []).length

console.log('--- assertions ---')
console.log('render completed:', rendered)
console.log('experts panel mounted:', expertsPanelMounted)
console.log('ExpertsSearchBar search input rendered:', hasSearchInput)
console.log('ExpertsSearchBar lab button rendered:', hasLabButton)
console.log('expert card grid nodes:', expertCards)
console.log('crash-boundary fired:', crashed)
console.log('useNavigate invariant errors:', navigateErrors.length)
console.log('root html length:', html.length)
console.log('root html head:', html.slice(0, 300).replace(/\s+/g, ' '))
// Dump a mid-file slice around the embedded surface so the catalog DOM is
// visible in the report.
console.log('experts panel slice:', panelHtml.slice(0, 900).replace(/\s+/g, ' '))

console.error = origError
process.exit(navigateErrors.length > 0 || crashed || !expertsPanelMounted || !hasSearchInput || !hasLabButton ? 1 : 0)
