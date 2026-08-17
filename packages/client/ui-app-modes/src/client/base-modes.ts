/**
 * The base app modes: the ones the app-mode surface plugin itself owns
 * (rail entries, icons, placeholder pages). Later modes are independent
 * modules — their ids join the frame's AppModeId union, but their glyphs,
 * copy, and pages live in their own packages.
 */

/** The base modes still owned by this package. */
export type BaseAppModeId = 'code' | 'work' | 'video' | 'image'

/** The base mode ids, in rail order. */
export const BASE_MODES: readonly BaseAppModeId[] = ['code', 'work', 'video', 'image']
