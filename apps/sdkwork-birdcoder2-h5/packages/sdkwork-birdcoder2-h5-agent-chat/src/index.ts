/**
 * Public contract of `@sdkwork/birdcoder2-h5-agent-chat`.
 *
 * Surface: `app`. Layer role: `frontend-feature`. Capability:
 * `agent-conversation`. The package owns the conversation screen, the session
 * list, the conversation state provider, and the route contributions the shell
 * registers.
 */

export const BIRDCODER2_H5_AGENT_CHAT_VERSION = '0.1.0' as const

export {
  BIRDCODER2_H5_AGENT_CHAT_PACKAGE,
  BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS,
} from './routes/appRouteContributions.ts'
export {
  ConversationProvider,
  readDeltaText,
  toConversationFailure,
  useConversation,
  type ConversationContextValue,
  type ConversationFailure,
  type ConversationFailureCode,
  type ConversationProviderProps,
} from './state/conversationState.tsx'
export { ChatPage } from './screens/ChatPage.tsx'
export { SessionListPage } from './screens/SessionListPage.tsx'
export {
  resolveAgentChatLanguage,
  resolveAgentChatMessages,
  resolveFailureBanner,
  type AgentChatLanguage,
  type AgentChatMessages,
  type FailureBanner,
} from './messages/agentChatMessages.ts'
