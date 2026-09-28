/**
 * Component name to screen resolution.
 *
 * A route contribution names a component, not an import: the registry has to be
 * serialisable for deep links and analytics, so the binding lives here. Screens
 * are imported lazily, which keeps the first paint of the tab bar from pulling
 * in every capability's screen bundle.
 */
import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react'

const LazyChatPage = lazy(async () => {
  const module = await import('@sdkwork/birdcoder2-h5-agent-chat/screens/ChatPage')
  return { default: module.ChatPage }
})

const LazySessionListPage = lazy(async () => {
  const module = await import('@sdkwork/birdcoder2-h5-agent-chat/screens/SessionListPage')
  return { default: module.SessionListPage }
})

const LazyHostsPage = lazy(async () => {
  const module = await import('@sdkwork/birdcoder2-h5-hosts/screens/HostsPage')
  return { default: module.HostsPage }
})

const LazyHostEnrollPage = lazy(async () => {
  const module = await import('@sdkwork/birdcoder2-h5-hosts/screens/HostEnrollPage')
  return { default: module.HostEnrollPage }
})

const ROUTE_COMPONENTS: Readonly<Record<string, LazyExoticComponent<ComponentType>>> = {
  ChatPage: LazyChatPage,
  SessionListPage: LazySessionListPage,
  HostsPage: LazyHostsPage,
  HostEnrollPage: LazyHostEnrollPage,
}

/**
 * Resolves a contribution's component key to an element.
 *
 * # Errors
 *
 * Throws when a contribution names a component no capability registered, which
 * is a build-time wiring mistake the router must not swallow into a blank
 * screen.
 */
export function resolveBirdCoder2H5RouteComponent(componentKey: string): ReactElement {
  const Component = ROUTE_COMPONENTS[componentKey]
  if (Component === undefined) {
    throw new Error(
      `unknown BirdCoder2 H5 route component "${componentKey}"; the capability that contributes it must register it in routeComponents`,
    )
  }
  return <Component />
}

/** The registered component keys, for tests and diagnostics. */
export function listBirdCoder2H5RouteComponentKeys(): readonly string[] {
  return Object.keys(ROUTE_COMPONENTS)
}
