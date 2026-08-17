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
  | 'work'
  | 'video'
  | 'image'
  | 'appstore'
  | 'knowledge'
  | 'assets'
  | 'account'
  | 'token-plan'

/** The mode the frame starts in: the Code workspace (the conversation surface). */
export const MODE_DEFAULT: AppModeId = 'code'
