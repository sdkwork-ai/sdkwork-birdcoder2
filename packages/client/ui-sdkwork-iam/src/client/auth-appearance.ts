/**
 * Maps the harness color scheme onto the sdkwork auth appearance presets
 * and overlays harness semantic tokens so the form column follows BirdCoder.
 * Token values are `var(--dsw-alias-*)` references resolved at runtime, so a
 * live theme switch repaints without rebuilding the appearance.
 */

import {
  createSdkworkAuthAppearancePreset,
  mergeSdkworkAuthAppearanceConfigs,
  type SdkworkAuthAppearanceConfig,
  type SdkworkAuthThemeTokens,
} from '@sdkwork/auth-pc-react'

/**
 * Form-column chrome. Light fields use `--dsw-alias-bg-overlay` (bluish-150)
 * against a white `bg-layer-2` shell: `bg-module-platform` is bluish-60, too
 * close to that white to mark the control. Dark fields use `bg-layer-1`, one
 * step darker than the elevated shell. Placeholders use `label-tertiary`
 * because light `label-dimmed` is a near-white fill, not input hint text.
 * The QR column uses the same shell fill. The frame around the white canvas
 * stays transparent so the bitmap is not boxed in a second inset.
 * @param colorScheme - the harness theme's resolved color scheme.
 * @returns the form-column token overlay for that scheme.
 */
function harnessThemeTokens(colorScheme: 'light' | 'dark'): SdkworkAuthThemeTokens {
  const fieldFill = colorScheme === 'light'
    ? 'var(--dsw-alias-bg-overlay)'
    : 'var(--dsw-alias-bg-layer-1)'
  return {
    asidePanelBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
    asidePanelColor: 'var(--dsw-alias-label-primary)',
    asideIconWellBackgroundColor: fieldFill,
    asideIconWellColor: 'var(--dsw-alias-label-secondary)',
    callbackBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
    contentBackgroundColor: 'transparent',
    contentTextColor: 'var(--dsw-alias-label-primary)',
    descriptionColor: 'var(--dsw-alias-label-secondary)',
    dividerColor: 'var(--dsw-alias-border-l1)',
    fieldBackgroundColor: fieldFill,
    fieldBorderColor: 'var(--dsw-alias-border-l2)',
    fieldPlaceholderColor: 'var(--dsw-alias-label-tertiary)',
    fieldTextColor: 'var(--dsw-alias-label-primary)',
    formMutedTextColor: 'var(--dsw-alias-label-secondary)',
    iconMutedColor: 'var(--dsw-alias-label-tertiary)',
    labelColor: 'var(--dsw-alias-label-secondary)',
    oauthProviderCardActionColor: 'var(--dsw-alias-label-tertiary)',
    oauthProviderCardBackgroundColor: fieldFill,
    oauthProviderCardBorderColor: 'var(--dsw-alias-border-l2)',
    oauthProviderCardHintColor: 'var(--dsw-alias-label-secondary)',
    oauthProviderCardIconBackgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
    oauthProviderCardIconColor: 'var(--dsw-alias-label-secondary)',
    oauthProviderCardTitleColor: 'var(--dsw-alias-label-primary)',
    pageBackgroundColor: 'var(--dsw-alias-bg-base)',
    qrFrameBackgroundColor: 'transparent',
    qrFrameBorderColor: 'transparent',
    shellBackgroundColor: 'var(--dsw-alias-bg-layer-2)',
    shellBorderColor: 'var(--dsw-alias-border-l1)',
    tabActiveBackgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
    tabActiveTextColor: 'var(--dsw-alias-label-primary)',
    tabBackgroundColor: 'transparent',
    tabInactiveTextColor: 'var(--dsw-alias-label-secondary)',
    titleColor: 'var(--dsw-alias-label-primary)',
    validationMessageColor: 'var(--dsw-alias-state-warn-primary)',
  }
}

/**
 * Drop the sdkwork aside gutter so the QR panel can sit flush against the
 * shell's rounded-xl clip. Background stays transparent: the panel fill is
 * the shell token, so a leftover dark rail cannot show through the card's
 * own rounded corners.
 */
const ASIDE_RAIL_SLOT_PROPS = {
  asideContainer: {
    style: {
      backgroundColor: 'transparent',
      padding: 0,
    },
  },
}

/**
 * The sdkwork appearance for one harness color scheme: the matching preset
 * (light `sdkwork`, dark `midnight`) with form-column harness tokens and a
 * QR column that follows the dialog shell.
 * @param colorScheme - the harness theme's resolved color scheme.
 * @returns the sdkwork appearance config.
 */
export function sdkworkAuthAppearanceFor(colorScheme: 'light' | 'dark'): SdkworkAuthAppearanceConfig {
  const preset = createSdkworkAuthAppearancePreset(colorScheme === 'dark' ? 'midnight' : 'sdkwork')
  // Two non-empty configs; merge's undefined return is only for an empty argument list.
  return mergeSdkworkAuthAppearanceConfigs(preset, {
    theme: harnessThemeTokens(colorScheme),
    slotProps: ASIDE_RAIL_SLOT_PROPS,
  })!
}
