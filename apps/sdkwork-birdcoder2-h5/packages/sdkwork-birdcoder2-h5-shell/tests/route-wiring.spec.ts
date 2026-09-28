import { describe, expect, it } from 'vitest'

import {
  birdCoder2H5RouteRegistry,
  createBirdCoder2H5RouteRegistry,
  listBirdCoder2H5RouteComponentKeys,
  listBirdCoder2H5RouteIconKeys,
  resolveBirdCoder2H5RouteComponent,
  resolveBirdCoder2H5RouteIcon,
  resolveBirdCoder2H5RouteTitle,
  type BirdCoder2H5ShellLabels,
} from '../src/index'

const EXPECTED_ROUTES: readonly (readonly [string, string])[] = [
  ['app.agent.chat.index', '/'],
  ['app.agent.chat.sessions', '/sessions'],
  ['app.host.fleet.index', '/hosts'],
  ['app.host.fleet.enroll', '/hosts/enroll'],
]

describe('createBirdCoder2H5RouteRegistry', () => {
  it('assembles every route the installed capabilities contribute', () => {
    const registry = createBirdCoder2H5RouteRegistry()
    for (const [id, path] of EXPECTED_ROUTES) {
      expect(registry.findById(id)?.path, id).toBe(path)
      expect(registry.findByPath(path)?.id, path).toBe(id)
    }
    expect(registry.routes).toHaveLength(EXPECTED_ROUTES.length)
  })

  it('derives the tab bar from the routes that ask to be tabbed', () => {
    const registry = createBirdCoder2H5RouteRegistry()
    expect(registry.tabs.map(tab => tab.id)).toEqual([
      'app.agent.chat.index',
      'app.agent.chat.sessions',
      'app.host.fleet.index',
    ])
  })

  it('memoizes the assembled registry', () => {
    expect(birdCoder2H5RouteRegistry()).toBe(birdCoder2H5RouteRegistry())
  })
})

describe('route component wiring', () => {
  // The failure this pins: a capability contributes a route whose `component`
  // key nobody registered. The router throws on that rather than rendering a
  // blank screen, so every single route has to resolve to a real screen.
  it('resolves every contributed route to a registered screen', () => {
    const registry = createBirdCoder2H5RouteRegistry()
    for (const route of registry.routes) {
      expect(
        listBirdCoder2H5RouteComponentKeys(),
        `${route.id} names "${route.component}"`,
      ).toContain(route.component)
      expect(() => resolveBirdCoder2H5RouteComponent(route.component)).not.toThrow()
    }
  })

  it('leaves no registered screen unreachable from a route', () => {
    const registry = createBirdCoder2H5RouteRegistry()
    const referenced = new Set(registry.routes.map(route => route.component))
    for (const key of listBirdCoder2H5RouteComponentKeys()) {
      expect(referenced, key).toContain(key)
    }
  })

  it('throws on an unknown component key instead of rendering nothing', () => {
    expect(() => resolveBirdCoder2H5RouteComponent('NopePage')).toThrowError(
      /unknown BirdCoder2 H5 route component "NopePage"/u,
    )
  })
})

describe('route icon wiring', () => {
  // The same failure the screen map pins, one layer over: a tab that names an
  // icon nobody registered would render a nameless glyph, and the tab bar is
  // the one surface a phone user cannot navigate around.
  it('resolves the icon of every tab to a registered glyph', () => {
    const registry = createBirdCoder2H5RouteRegistry()
    for (const tab of registry.tabs) {
      expect(listBirdCoder2H5RouteIconKeys(), `${tab.id} names "${tab.iconKey}"`).toContain(
        tab.iconKey,
      )
      expect(() => resolveBirdCoder2H5RouteIcon(tab.iconKey ?? '')).not.toThrow()
    }
  })

  it('gives every tab its own glyph', () => {
    const keys = createBirdCoder2H5RouteRegistry().tabs.map(tab => tab.iconKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('leaves no registered icon unreachable from a tab', () => {
    const referenced = new Set(
      createBirdCoder2H5RouteRegistry()
        .tabs.map(tab => tab.iconKey)
        .filter((key): key is string => key !== undefined),
    )
    for (const key of listBirdCoder2H5RouteIconKeys()) {
      expect(referenced, key).toContain(key)
    }
  })

  it('throws on an unknown icon key instead of rendering a nameless tab', () => {
    expect(() => resolveBirdCoder2H5RouteIcon('nope')).toThrowError(
      /unknown BirdCoder2 H5 route icon "nope"/u,
    )
  })
})

describe('resolveBirdCoder2H5RouteTitle', () => {
  const labels: BirdCoder2H5ShellLabels = {
    productName: 'BirdCoder',
    routeLabels: {
      'route.chat': 'Conversation',
      'route.sessions': 'Conversations',
      'route.hosts': 'Hosts',
      'route.hostEnroll': 'Enroll a host',
    },
  }
  const registry = createBirdCoder2H5RouteRegistry()

  it('uses the label of the tab the path matches', () => {
    expect(resolveBirdCoder2H5RouteTitle('/sessions', registry, labels)).toBe('Conversations')
    expect(resolveBirdCoder2H5RouteTitle('/hosts', registry, labels)).toBe('Hosts')
  })

  // The failure this pins: a screen route declares a titleKey too, and looking
  // only at the tab bar made `/hosts/enroll` render the conversation title.
  it('uses the declared title of a screen that is not a tab', () => {
    expect(resolveBirdCoder2H5RouteTitle('/hosts/enroll', registry, labels)).toBe('Enroll a host')
  })

  it('falls back to the conversation label on a path no route claims', () => {
    expect(resolveBirdCoder2H5RouteTitle('/unknown', registry, labels)).toBe('Conversation')
  })

  it('shows the untranslated key rather than a blank bar', () => {
    const partial: BirdCoder2H5ShellLabels = { productName: 'BirdCoder', routeLabels: {} }
    expect(resolveBirdCoder2H5RouteTitle('/sessions', registry, partial)).toBe('route.sessions')
    expect(resolveBirdCoder2H5RouteTitle('/unknown', registry, partial)).toBe('BirdCoder')
  })
})
