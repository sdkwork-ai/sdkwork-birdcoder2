/**
 * The message center's main-panel key. The key is the rail shortcut's list id,
 * the `main` slot entry key the frame renders, and the value
 * `ctx.layout.selectPanel` receives; one vocabulary keeps those three
 * namespaces from drifting.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/panel-id
 */
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Main-panel key and rail-shortcut id of the message center. */
export const MESSAGE_CENTER_PANEL_ID = 'message-center' as MainPanelId
