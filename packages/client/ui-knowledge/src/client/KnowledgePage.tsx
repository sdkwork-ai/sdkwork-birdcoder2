/**
 * The Knowledge Base page: the center-column surface for the `knowledge` mode,
 * keyed into the frame's `mode.page` slot. Mounts the SDKWork knowledgebase
 * PC surface through this plugin's host adapter.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { KnowledgebaseApp } from './knowledgebaseHost.ts'
import css from './KnowledgePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface KnowledgePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'knowledge'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type KnowledgePageProps =
  PropsRuntime<'mode.page'>
  & KnowledgePageInjected
  & PropsLocale<'knowledge'>

/**
 * Render the Knowledge Base page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function KnowledgePage({ mode }: KnowledgePageProps) {
  return (
    <div className={css.page} data-knowledge-surface="sdkwork" data-mode={mode} data-mode-page={mode}>
      <KnowledgebaseApp />
    </div>
  )
}
