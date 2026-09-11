/**
 * The Excel presentation constants the worksheet surface draws with.
 *
 * A spreadsheet preview answers to the worksheet it shows, not to the host's
 * theme: a reader comparing the preview against Excel must see the same paper,
 * the same gridline grey, and the same selection green in light mode and dark
 * mode alike. These values are therefore the document's own palette — the
 * satellite chrome around the grid (name box, formula bar, sheet tabs, status
 * bar) is the only part that answers to `--dsw-alias-*` tokens.
 *
 * The values are Excel's own defaults: the 11pt Calibri cell font (14.67px at
 * 96 DPI), the 19px row and 64px column, the gridline grey a `windowText`-less
 * sheet paints, and the #217346 active-cell frame.
 */

/** The worksheet's paper. */
export const SHEET_BACKGROUND = '#FFFFFF'

/** The gridline a sheet paints when its own view states no colour. */
export const GRIDLINE_COLOR = '#D0D7DE'

/** The default cell font, in pixels, and its family. */
export const CELL_FONT_SIZE = 14.6667
export const CELL_FONT_FAMILY = 'Calibri, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'

/** The cell padding Excel keeps: three pixels before the text, two after it. */
export const CELL_PADDING_LEFT = 3
export const CELL_PADDING_RIGHT = 2

/** The default cell text colour, for a cell whose font states none. */
export const CELL_TEXT_COLOR = '#000000'

/** The size of the row-number and column-letter bands. */
export const HEADER_SIZE = 20

/** The band's own palette, fixed regardless of the host theme. */
export const HEADER_BACKGROUND = '#F5F5F5'
export const HEADER_BORDER = '#D4D4D4'
export const HEADER_LABEL = '#444444'
/** A band entry the pointer is over, which Excel lifts a shade. */
export const HEADER_HOVER_BACKGROUND = '#EAEAEA'
/** A band entry whose row or column the selection covers. */
export const HEADER_SELECTED_BACKGROUND = '#D3E5D5'
/** The band entry of the active row or column, which Excel tints deeper. */
export const HEADER_ACTIVE_BACKGROUND = '#C7DFC9'
/** The label colour of the active row or column, which Excel prints in green. */
export const HEADER_ACTIVE_LABEL = '#1B5E20'

/** The active cell's frame, and the colour of the fill handle it carries. */
export const ACTIVE_BORDER = '#217346'
export const ACTIVE_BORDER_WIDTH = 2
/** The fill handle's own size and border. */
export const FILL_HANDLE_SIZE = 7
export const FILL_HANDLE_BORDER = '#217346'

/** The wash Excel lays over the rest of a multi-cell selection. */
export const SELECTION_FILL = 'rgba(33, 115, 70, 0.10)'

/** The seam Excel draws beside a frozen pane. */
export const FROZEN_PANE_BORDER = '#8EA9DB'

/** The underline a selected sheet tab carries. */
export const TAB_ACTIVE_UNDERLINE = '#217346'

/** A hyperlink's own colour, which the workbook's theme usually states. */
export const HYPERLINK_COLOR = '#0563C1'

/** Excel's maximum digit width for the default font, in pixels, at 96 DPI. */
export const MAX_DIGIT_WIDTH = 7

/** The grid's own limits, which a malformed extent must not exceed. */
export const MAX_COLUMN_COUNT = 16_384
export const MAX_ROW_COUNT = 1_048_576
