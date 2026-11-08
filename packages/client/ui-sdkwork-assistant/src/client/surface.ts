/**
 * The assistant surface's identity: the linked persona-bot layer registers its
 * whole interface as one keyed `main` panel, and the rail cell opens that panel
 * rather than a `mode.page` of its own. The key is the plugin's published
 * navigation id (the same one its own sidebar row uses), so this integration
 * owns no copy of its interface.
 */
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Main-panel key the `@botharness/ui` browser half registers (`PANEL_ID`). */
export const ASSISTANT_PANEL_ID = 'botharness' as MainPanelId

/**
 * The rail cell's vocabulary key. The frame never switches to this mode: the
 * cell is a navigation cell in the mode group, and its selection follows the
 * main-panel selection instead (see `ModeRailEntryOwnerProps`).
 */
export const ASSISTANT_MODE: AppModeId = 'assistant'
