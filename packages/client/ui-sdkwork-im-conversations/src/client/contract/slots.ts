/**
 * The chat mode's own slot contract: the conversation pane seat inside the
 * chat page. Declared by ui-sdkwork-im-conversations' `mode.page` entry and
 * occupied by ui-sdkwork-im-chat, keyed by the selected conversation so the
 * host page owns selection and the pane owns rendering.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The conversation pane inside the chat mode page. Kind `single`: one
     * conversation is open at a time. The chat page passes the selected
     * conversation id as its owner share.
     */
    'im.chat.pane': { kind: 'single'; scope: 'root'; owner: ImChatPaneOwnerProps }
  }
}

/** Owner share of the conversation pane: the conversation the page selected. */
export interface ImChatPaneOwnerProps {
  /** Conversation the page currently shows. */
  conversationId: string
}
