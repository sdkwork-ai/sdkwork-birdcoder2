/**
 * Frame-level app-mode vocabulary: which application surface the frame
 * renders in the center column. The mode id union is a frame navigation
 * contract (like the panel widths), so it lives with the layout package; the
 * mode rail entries, labels, and keyed pages are the app-mode feature modules'
 * concern — each mode's rail entry and page is contributed by its owning plugin.
 */

/** The application surfaces the frame can show. */
export type AppModeId =
  | 'code'
  /**
   * The assistant surface (the SDKWork Bot team). It is a *shell* mode like
   * `code` — the frame keeps the left column and the Session conversation —
   * because the Bot team UI is a skin of that conversation and its sidebar,
   * not a keyed page of its own. `ui-sdkwork-assistant` owns the rail entry.
   */
  | 'assistant'
  | 'chat'
  | 'contacts'
  | 'work'
  | 'pull-request'
  | 'automation'
  | 'markets'
  | 'template-library'
  | 'demand-hall'
  | 'im'
  | 'video'
  | 'image'
  | 'document'
  | 'appstore'
  | 'knowledge'
  | 'course'
  | 'drive'
  | 'assets'
  | 'search'
  | 'account'
  | 'token-plan'

/** The mode the frame starts in: the Code workspace (the conversation surface). */
export const MODE_DEFAULT: AppModeId = 'code'
