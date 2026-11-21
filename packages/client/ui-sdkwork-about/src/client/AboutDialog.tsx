/**
 * The About dialog: one `shell.overlay` entry rendering the same content as the
 * settings page in compact framing. The desktop shell's About command opens it
 * through `ctx.about`, so the application menu and the settings page reach one
 * surface instead of two designs.
 *
 * The frame's overlay layer is click-through; the dialog's own mask owns pointer
 * events while mounted, and nothing renders otherwise.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createAboutStore } from './about-store.ts'
import type { AboutInjected } from './about-face.ts'
import { AboutContent } from './AboutContent.tsx'
import css from './AboutDialog.module.css'

/** Full component props: overlay owner share + declared store + injected face + locale seat. */
export type AboutDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createAboutStore>>
  & InjectFace<AboutInjected>
  & PropsLocale<'settings.about'>

/**
 * Render the About dialog while the store says it is open.
 *
 * Portaled to the document body because the frame's overlay layer is a low
 * stacking context: a dialog mounted inside it would paint below the page modal
 * that raised it.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the dialog element tree, or nothing while closed.
 */
export function AboutDialog(props: AboutDialogProps) {
  const open = props.useStore(state => state.open)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current
    /* v8 ignore next -- the portal host is rendered by this component, so the ref is attached before the effect runs */
    if (node === null) return
    const clear = (): void => {
      node.removeAttribute('aria-hidden')
      node.removeAttribute('data-aria-hidden')
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(node, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] })
    return () => { observer.disconnect() }
  }, [])
  return createPortal(
    <div ref={host} data-about-host="true" style={{ display: 'contents' }}>
      {open ? <AboutDialogSurface {...props} /> : null}
    </div>,
    document.body,
  )
}

function AboutDialogSurface(props: AboutDialogProps) {
  const { useLocal, useInstallation, refresh, actions, t } = props
  const local = useLocal(snapshot => snapshot)
  const installation = useInstallation(snapshot => snapshot)
  const panel = useRef<HTMLDivElement>(null)
  const close = actions.close

  // Landing focus and restoration are the dialog's own: the surface mounts only
  // while open, so one effect owns both edges.
  useEffect(() => {
    const previous = document.activeElement
    panel.current?.focus()
    return () => {
      /* v8 ignore next -- every opener in the shell is a focused HTML control; a non-HTML active element has no focus to restore */
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [close])

  return (
    <div className={css.mask} role="presentation" onClick={close}>
      <div
        ref={panel}
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.title')}
        tabIndex={-1}
        onClick={(event) => { event.stopPropagation() }}
      >
        <button type="button" className={css.close} aria-label={t('dialog.close')} onClick={close}>
          <IconCloseOutlineRegular size={14} />
        </button>
        <div className={css.body}>
          <AboutContent
            t={t}
            local={local}
            installation={installation}
            variant="dialog"
            onRefresh={refresh}
          />
        </div>
        <div className={css.actions}>
          <Button variant="primary" onClick={close}>{t('dialog.confirm')}</Button>
        </div>
      </div>
    </div>
  )
}
