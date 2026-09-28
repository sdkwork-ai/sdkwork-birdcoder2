/**
 * Routes owned by the agent conversation capability.
 *
 * Two tabs: the live conversation at `/`, and the session list at `/sessions`.
 * Both carry the same domain and capability segment, so a deep link and the
 * navigation model agree on what belongs to this feature.
 */
import { routeIdOf } from '@sdkwork/birdcoder2-h5-core'

/** Package name the core registry attributes these routes to. */
export const BIRDCODER2_H5_AGENT_CHAT_PACKAGE = '@sdkwork/birdcoder2-h5-agent-chat'

export const BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS = [
  {
    id: routeIdOf('agent', 'chat', 'index'),
    path: '/',
    component: 'ChatPage',
    auth: 'required',
    presentation: 'tab',
    titleKey: 'route.chat',
    tabLabelKey: 'route.chat',
    iconKey: 'agent-chat',
  },
  {
    id: routeIdOf('agent', 'chat', 'sessions'),
    path: '/sessions',
    component: 'SessionListPage',
    auth: 'required',
    presentation: 'tab',
    titleKey: 'route.sessions',
    tabLabelKey: 'route.sessions',
    iconKey: 'agent-sessions',
  },
] as const
