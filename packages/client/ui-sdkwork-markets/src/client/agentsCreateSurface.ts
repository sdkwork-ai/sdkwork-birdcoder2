/**
 * Curated create-flow export surface for the embedded SDKWork Agents editor.
 *
 * FORK DIVERGENCE: upstream's `@sdkwork/agents-pc-agents/create` entry — the
 * surface `expertsHost.tsx` loads — is not part of the pinned sibling
 * checkout. It exists only as an untracked file in a local workspace, so a
 * release lane that clones the pinned siblings cannot resolve the specifier:
 * the browser bundle fails with `Matched alias not found for
 * '@sdkwork/agents-pc-agents/create'`. The curated surface is therefore
 * restated here, in the fork, re-exporting the same four sibling modules the
 * missing entry re-exported; `tsconfig.base.json` maps the specifier to this
 * file so the host adapter, its tests, and the bundle all resolve one module.
 *
 * The curation is the point: hosts that embed only the creation flow import
 * this surface instead of the capability package's root barrel, whose chat and
 * home surfaces (`AgentChatView`, `AgentsHomePage`, `agentChatService`) reach
 * the chat transport and the Monaco loader. Keeping the barrel out of the
 * graph keeps the embedded closure to the creation surface plus the knowledge
 * selection binding it configures.
 */
export { CreateAgentModal } from '@sdkwork/agents-pc-agents/components/CreateAgentModal'
export { CreateAgentView } from '@sdkwork/agents-pc-agents/pages/CreateAgentView'
export type {
  CreateAgentCapability,
  CreateAgentViewProps,
} from '@sdkwork/agents-pc-agents/pages/CreateAgentView'
export {
  configureKnowledgeSelectionAdapter,
} from '@sdkwork/agents-pc-agents/services/knowledgeSelectionAdapter'
export {
  createKnowledgebaseSelectionAdapter,
} from '@sdkwork/agents-pc-agents/services/createKnowledgebaseSelectionAdapter'
