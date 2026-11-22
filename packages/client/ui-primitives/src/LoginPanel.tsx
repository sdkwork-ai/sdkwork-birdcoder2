// FORK-OWNED FILE: the one welcome/login surface every BirdCoder login entry
// renders. The desktop welcome window and the web account dialog share it, so
// the product has a single login component instead of one per client. Upstream
// has no such component; a merge can therefore never revert the unification.
// Copy arrives entirely as props (this package owns no locale), as with every
// other primitive.

import type { ReactNode } from 'react'
import { Fragment } from 'react'
import clsx from 'clsx'
import { StateDot } from './StateDot.tsx'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import css from './LoginPanel.module.css'

/** One action row of the login surface, in visual order. */
export interface LoginAction {
  /** Stable DOM id so a host keeps its automation anchors. */
  id?: string | undefined
  /** Visible label; also the default accessible name while busy. */
  label: string
  /** Emphasis: filled primary, elevated secondary, or the quiet text action after the column's buttons. */
  kind?: 'primary' | 'secondary' | 'text' | undefined
  /** An in-flight action: disabled, spinning, and named by `busyLabel`. */
  busy?: boolean | undefined
  /** Accessible name of a busy action; defaults to `label`. */
  busyLabel?: string | undefined
  disabled?: boolean | undefined
  /** Hides the control while keeping it in the DOM for a host that toggles state. */
  hidden?: boolean | undefined
  /** Submit the named form instead of handling a click. */
  form?: string | undefined
  onClick?: (() => void) | undefined
}

/** Entry identity block: the welcome line and its slogan. */
export interface LoginWelcomeCopy {
  /** Rendered before the emphasized product name. */
  before: string
  /** Emphasized product name. */
  brand: string
  /** Rendered after the emphasized product name. */
  after: string
  /** Slogan under the welcome line. */
  description: string
}

/** One bottom link of the landing presentation, in display order. */
export interface LoginFooterLink {
  /** Localized link text. */
  label: string
  /** Absolute target the host opens in the system browser. */
  href: string
}

/** Props of the shared login surface. */
export interface LoginPanelProps {
  /** Product name beside the mark, and the mark's default alternative text. */
  brand: string
  /** Product mark raster. A host outside the web root passes its own asset. */
  logoSrc: string
  /** Alternative text of the mark; `''` keeps it decorative when the welcome line already names the product. */
  markAlt?: string | undefined
  /** Welcome block; omitted on a method step that replaces it with `children`. */
  welcome?: LoginWelcomeCopy | undefined
  /** Keeps the welcome block mounted but hidden, for a host that toggles pages. */
  welcomeHidden?: boolean | undefined
  /** Middle content under (or instead of) the welcome block: status copy, a key form. */
  children?: ReactNode
  /** Action column, in visual order. */
  actions: readonly LoginAction[]
  /**
   * `window` fills a standalone window and reproduces the desktop welcome
   * layout; `dialog` is the compact form inside a modal card; `landing` is the
   * signed-out entry — the mark above a large welcome line, a single primary
   * action, and the product links pinned below.
   */
  variant?: 'window' | 'dialog' | 'landing' | undefined
  /** Landing mark raster; defaults to `logoSrc`. A host may pass a larger cut of the same art. */
  heroSrc?: string | undefined
  /** Footer links the landing pins below the action; other variants ignore them. */
  footerLinks?: readonly LoginFooterLink[] | undefined
  /** Opens one footer link. Without it the links stay inert instead of navigating the window. */
  onOpenLink?: ((href: string) => void) | undefined
  /** Id of the welcome heading, for the host's `aria-labelledby`. */
  headingId?: string | undefined
  /** Id of the slogan paragraph, for the host's `aria-describedby`. */
  descriptionId?: string | undefined
  /** Accessible dismiss control in the dialog corner; omitted renders none. */
  close?: { label: string; onClick: () => void } | undefined
  /** Extra class for the host's own placement. */
  className?: string | undefined
}

/**
 * Render the unified BirdCoder login surface.
 * @param props - brand art, welcome copy, host content, and the action column.
 * @returns the brand row (or landing hero), the identity/content area, the actions, and the landing footer.
 */
export function LoginPanel({
  brand, logoSrc, markAlt = brand, welcome, welcomeHidden = false, children, actions, variant = 'window',
  heroSrc, footerLinks, onOpenLink, headingId, descriptionId, close, className,
}: LoginPanelProps) {
  const landing = variant === 'landing'
  return (
    <div className={clsx(css.panel, css[variant], className)}>
      {!landing && (
        <div className={css.brand}>
          <img className={css.mark} src={logoSrc} alt={markAlt} width={40} height={40} />
          <span className={css.wordmark} aria-hidden="true">{brand}</span>
        </div>
      )}
      <div className={css.middle}>
        {landing && <img className={css.hero} src={heroSrc ?? logoSrc} alt="" width={112} height={112} />}
        {welcome !== undefined && (
          <div className={css.welcome} hidden={welcomeHidden}>
            <h1 id={headingId} className={css.heading}>
              <span>{welcome.before}</span><em>{welcome.brand}</em><span>{welcome.after}</span>
            </h1>
            {welcome.description === ''
              ? null
              : <p id={descriptionId} className={css.description}>{welcome.description}</p>}
          </div>
        )}
        {children}
      </div>
      <div className={css.actions}>
        {actions.map((action, index) => (
          <button
            key={action.id ?? `${action.kind ?? 'primary'}-${index}`}
            id={action.id}
            type={action.form === undefined ? 'button' : 'submit'}
            form={action.form}
            className={css[action.kind ?? 'primary']}
            data-busy={action.busy === true ? 'true' : undefined}
            disabled={action.disabled === true || action.busy === true}
            hidden={action.hidden === true}
            aria-label={action.busy === true ? action.busyLabel ?? action.label : undefined}
            onClick={action.form === undefined ? action.onClick : undefined}
          >
            {action.busy === true ? <StateDot state="ongoing" size={16} /> : action.label}
          </button>
        ))}
      </div>
      {landing && footerLinks !== undefined && footerLinks.length > 0 && (
        <div className={css.footer}>
          {footerLinks.map((link, index) => (
            <Fragment key={link.href}>
              {index > 0 && <span className={css.footerDivider} aria-hidden="true">|</span>}
              <a
                className={css.footerLink}
                href={link.href}
                onClick={onOpenLink === undefined
                  ? (event) => { event.preventDefault() }
                  : (event) => { event.preventDefault(); onOpenLink(link.href) }}
              >
                {link.label}
              </a>
            </Fragment>
          ))}
        </div>
      )}
      {close !== undefined && (
        <button type="button" className={css.close} aria-label={close.label} onClick={close.onClick}>
          <IconCloseOutlineRegular size={14} />
        </button>
      )}
    </div>
  )
}
