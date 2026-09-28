/**
 * Conversation state that outlives a single screen mount.
 *
 * The H5 client's only durable conversation state is the event watermark: the
 * host runtime produces an ordered agent-event log, the mobile client applies
 * pages of it, and the last applied `sequence` is what turns a reconnect into a
 * resume. Keeping that in the core package means the `agent-chat` capability
 * package stays free of storage concerns, exactly like it stays free of transport
 * concerns.
 */

export {
  BIRDCODER2_H5_WATERMARK_KEY,
  clearConversationWatermark,
  readConversationWatermark,
  readConversationWatermarks,
  writeConversationWatermark,
} from './conversationWatermarks.ts'
export type { ConversationWatermark, ConversationWatermarks } from './conversationWatermarks.ts'
