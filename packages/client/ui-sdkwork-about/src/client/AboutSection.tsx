/**
 * The 关于 (About) settings section: the product page inside the settings
 * panel's content column. It is the durable home of the About information —
 * the desktop About command opens the same content as a dialog — and it stays
 * useful offline, because the build version and the deployment endpoint are
 * local facts while the registered app id and deployment identity come from the
 * platform.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-settings' settings.section SlotMap row into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AboutContent } from './AboutContent.tsx'
import type { AboutInjected } from './about-face.ts'
import css from './AboutSection.module.css'

/** Full component props: section owner share + locale seat + injected face. */
export type AboutSectionComponentProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.about'>
  & InjectFace<AboutInjected>

/**
 * Render the About page.
 * @param props - composed slot props (owner share + locale seat + injected face).
 * @returns the About content inside the settings content column.
 */
export function AboutSection(props: AboutSectionComponentProps) {
  const { useLocal, useInstallation, refresh, t } = props
  const local = useLocal(snapshot => snapshot)
  const installation = useInstallation(snapshot => snapshot)
  return (
    <div className={css.page}>
      <AboutContent
        t={t}
        local={local}
        installation={installation}
        variant="page"
        onRefresh={refresh}
      />
    </div>
  )
}
