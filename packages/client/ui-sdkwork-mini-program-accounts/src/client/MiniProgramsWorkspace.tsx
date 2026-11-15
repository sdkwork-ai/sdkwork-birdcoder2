/**
 * Mini-program account workspace inside the settings dialog: the shared
 * `@sdkwork/iam-pc-mini-program` operator panel plus the SDKWork theme and
 * message providers it renders under.
 *
 * The panel is a workspace, not a page: it renders the account list, the
 * create/edit drawer, the enable switch, the delete confirmation, and the
 * login diagnostic. This component only supplies the harness locale and color
 * scheme — the account model, controller, transport, and copy all live in the
 * shared package.
 */
import type { ReactNode } from 'react'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import { SdkworkThemeProvider } from '@sdkwork/ui-pc-react'
import {
  DEFAULT_OPERATOR_CAPABILITIES,
  SDKWORK_MINI_PROGRAM_I18N_CATALOG,
  SdkworkMiniProgramPanel,
  type MiniProgramController,
} from '@sdkwork/iam-pc-mini-program'
import css from './MiniProgramsModal.module.css'

/** Props handed down by the dialog. */
export interface MiniProgramsWorkspaceProps {
  /** The shared controller built by the host adapter. */
  controller: MiniProgramController
  /** Harness active locale id (`zh`, `en`, or another registered tag). */
  language: string
  /** Harness color scheme the embedded SDKWork surface follows. */
  colorScheme: 'light' | 'dark'
}

/**
 * Map the harness locale id onto the catalog tag the embedded panel resolves.
 * @param language - the harness active locale.
 * @returns the SDKWork locale tag.
 */
export function toMiniProgramLocale(language: string): string {
  return language === 'zh' ? 'zh-CN' : 'en-US'
}

/**
 * Render the mini-program account workspace.
 * @param props - the controller and the harness locale/theme facts.
 * @returns the workspace element tree.
 */
export function MiniProgramsWorkspace({
  controller,
  language,
  colorScheme,
}: MiniProgramsWorkspaceProps): ReactNode {
  return (
    <SdkworkThemeProvider className={css.surface} themeColor="tech-blue" themeSelection={colorScheme}>
      <SdkworkI18nProvider
        catalogs={[SDKWORK_MINI_PROGRAM_I18N_CATALOG]}
        locale={toMiniProgramLocale(language)}
      >
        <SdkworkMiniProgramPanel
          capabilities={DEFAULT_OPERATOR_CAPABILITIES}
          controller={controller}
        />
      </SdkworkI18nProvider>
    </SdkworkThemeProvider>
  )
}
