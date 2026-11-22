/**
 * The app types a custom directory can be published as.
 *
 * A governed `agent.app.config.json` already names its console type card; an
 * arbitrary directory does not, so the custom-directory flow detects one from
 * its project files and lets the operator override the guess. Each option
 * carries the console card id plus the scaffold platform ids that card implies,
 * because both the platform-app record and the scaffold version need them.
 */

/** One selectable application type. */
export interface ScaffoldAppTypeOption {
  /** Stable selection id (the select value). */
  readonly id: string
  /** Console type card id; undefined for a multi-platform mobile root. */
  readonly cardId?: string
  /** Scaffold platform ids written into the version. */
  readonly platforms: readonly string[]
  /** Dictionary key of the display label (`scaffoldCenter.type.*`). */
  readonly labelKey: string
}

/** Every type the custom-directory flow offers, detected or manual. */
export const SCAFFOLD_APP_TYPE_OPTIONS: readonly ScaffoldAppTypeOption[] = [
  { id: 'h5', cardId: 'h5', platforms: ['H5'], labelKey: 'scaffoldCenter.type.h5' },
  { id: 'pc-web', cardId: 'pc-web', platforms: ['PC'], labelKey: 'scaffoldCenter.type.pcWeb' },
  { id: 'desktop', cardId: 'desktop', platforms: ['DESKTOP'], labelKey: 'scaffoldCenter.type.desktop' },
  {
    id: 'mini-program',
    cardId: 'mini-program',
    platforms: ['MINIPROGRAM'],
    labelKey: 'scaffoldCenter.type.miniProgram',
  },
  { id: 'android', cardId: 'android', platforms: ['ANDROID'], labelKey: 'scaffoldCenter.type.android' },
  { id: 'ios', cardId: 'ios', platforms: ['IOS'], labelKey: 'scaffoldCenter.type.ios' },
  { id: 'harmonyos', cardId: 'harmonyos', platforms: ['HARMONY'], labelKey: 'scaffoldCenter.type.harmony' },
  {
    id: 'static-web',
    cardId: 'static-web',
    platforms: ['STATIC_WEB'],
    labelKey: 'scaffoldCenter.type.staticWeb',
  },
  {
    id: 'flutter',
    platforms: ['ANDROID', 'IOS'],
    labelKey: 'scaffoldCenter.type.flutter',
  },
  {
    id: 'mobile',
    platforms: ['ANDROID', 'IOS'],
    labelKey: 'scaffoldCenter.type.mobile',
  },
  { id: 'api-service', cardId: 'api-service', platforms: [], labelKey: 'scaffoldCenter.type.apiService' },
] as const

/**
 * Resolve one type option.
 * @param id - the select value.
 * @returns the option, or undefined for an empty/unknown id.
 */
export function scaffoldAppTypeOption(id: string | undefined): ScaffoldAppTypeOption | undefined {
  if (id === undefined || id === '') return undefined
  return SCAFFOLD_APP_TYPE_OPTIONS.find(option => option.id === id)
}

/**
 * Infer the select value from a manifest-derived card/platform pair.
 * Flutter and React-Native roots both have no console card, so their
 * detection path records the type id explicitly instead.
 * @param cardId - console type card id.
 * @param platforms - scaffold platform ids.
 * @returns a matching option id, or undefined when the pair is ambiguous.
 */
export function inferScaffoldAppTypeId(
  cardId: string | undefined,
  platforms: readonly string[],
): string | undefined {
  if (cardId !== undefined) {
    const byCard = SCAFFOLD_APP_TYPE_OPTIONS.find(option => option.cardId === cardId)
    if (byCard !== undefined) return byCard.id
  }
  if (platforms.includes('FLUTTER')) return 'flutter'
  if (platforms.includes('ANDROID') && platforms.includes('IOS')) return 'mobile'
  if (platforms.includes('ANDROID')) return 'android'
  if (platforms.includes('IOS')) return 'ios'
  if (platforms.includes('HARMONY')) return 'harmonyos'
  if (platforms.includes('MINIPROGRAM')) return 'mini-program'
  if (platforms.includes('DESKTOP')) return 'desktop'
  if (platforms.includes('PC')) return 'pc-web'
  if (platforms.includes('STATIC_WEB')) return 'static-web'
  if (platforms.includes('H5')) return 'h5'
  return undefined
}
