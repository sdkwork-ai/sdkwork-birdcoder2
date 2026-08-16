/**
 * Maps the harness color scheme onto the sdkwork auth appearance presets
 * and overlays the harness semantic tokens, so every surface color (panel,
 * fields, labels, tabs, oauth cards) follows the running application theme
 * instead of the sdkwork palettes. The token values are `var(--dsw-alias-*)`
 * references resolved at runtime, so a live theme switch repaints the
 * surfaces without rebuilding the appearance.
 */

import {
  createSdkworkAuthAppearancePreset,
  mergeSdkworkAuthAppearanceConfigs,
  type SdkworkAuthAppearanceConfig,
  type SdkworkAuthThemeTokens,
} from '@sdkwork/auth-pc-react'

/**
 * The harness semantic tokens projected onto the auth surface: panel chrome,
 * field chrome, labels, tabs, and oauth cards all read the application's
 * palette in both color schemes. The aside column and the badge keep the
 * preset's branded decoration — that rail is the auth brand element, not a
 * harness surface.
 */
const HARNESS_THEME_TOKENS: SdkworkAuthThemeTokens = {
  callbackBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
  contentBackgroundColor: 'transparent',
  contentTextColor: 'var(--dsw-alias-label-primary)',
  descriptionColor: 'var(--dsw-alias-label-secondary)',
  dividerColor: 'var(--dsw-alias-border-l1)',
  fieldBackgroundColor: 'var(--dsw-alias-bg-layer-1)',
  fieldBorderColor: 'var(--dsw-alias-border-l2)',
  fieldPlaceholderColor: 'var(--dsw-alias-label-dimmed)',
  fieldTextColor: 'var(--dsw-alias-label-primary)',
  formMutedTextColor: 'var(--dsw-alias-label-secondary)',
  iconMutedColor: 'var(--dsw-alias-label-tertiary)',
  labelColor: 'var(--dsw-alias-label-secondary)',
  oauthProviderCardActionColor: 'var(--dsw-alias-label-tertiary)',
  oauthProviderCardBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
  oauthProviderCardBorderColor: 'var(--dsw-alias-border-l1)',
  oauthProviderCardHintColor: 'var(--dsw-alias-label-secondary)',
  oauthProviderCardIconBackgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
  oauthProviderCardIconColor: 'var(--dsw-alias-label-secondary)',
  oauthProviderCardTitleColor: 'var(--dsw-alias-label-primary)',
  pageBackgroundColor: 'var(--dsw-alias-bg-base)',
  qrFrameBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
  qrFrameBorderColor: 'var(--dsw-alias-border-l1)',
  shellBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
  shellBorderColor: 'var(--dsw-alias-border-l1)',
  tabActiveBackgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
  tabActiveTextColor: 'var(--dsw-alias-label-primary)',
  tabBackgroundColor: 'transparent',
  tabInactiveTextColor: 'var(--dsw-alias-label-secondary)',
  titleColor: 'var(--dsw-alias-label-primary)',
  validationMessageColor: 'var(--dsw-alias-state-warn-primary)',
}

/**
 * The sdkwork appearance for one harness color scheme: the matching preset
 * (light `sdkwork`, dark `midnight`) repainted with the harness tokens.
 * @param colorScheme - the harness theme's resolved color scheme.
 * @returns the sdkwork appearance config.
 */
export function sdkworkAuthAppearanceFor(colorScheme: 'light' | 'dark'): SdkworkAuthAppearanceConfig {
  const preset = createSdkworkAuthAppearancePreset(colorScheme === 'dark' ? 'midnight' : 'sdkwork')
  // The merge of two non-empty configs never returns undefined; the fallback
  // keeps the declared return total.
  return mergeSdkworkAuthAppearanceConfigs(preset, { theme: HARNESS_THEME_TOKENS }) ?? preset
}
