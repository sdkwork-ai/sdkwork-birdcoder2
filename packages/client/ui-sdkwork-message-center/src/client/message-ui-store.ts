/**
 * Message-center UI store: the cross-entry viewing state the rail shortcut and
 * the overlay host share. Open state is the only member; the notification page
 * itself belongs to {@link MessageCenterService}.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/message-ui-store
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Shared message-center surface state. */
export interface MessageCenterUiState {
  /** Whether the message center overlay is showing. */
  open: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type MessageCenterUiActions = {
  openDialog: (draft: MessageCenterUiState) => void
  closeDialog: (draft: MessageCenterUiState) => void
}

/**
 * Declares the message-center overlay state and write surface.
 * @returns the store handle shared by the rail entry and the overlay host.
 */
export function createMessageCenterUiStore(): EngineStoreHandle<MessageCenterUiState, MessageCenterUiActions> {
  return defineStore({
    init: (): MessageCenterUiState => ({ open: false }),
    actions: {
      openDialog: (draft) => { draft.open = true },
      closeDialog: (draft) => { draft.open = false },
    },
  })
}
