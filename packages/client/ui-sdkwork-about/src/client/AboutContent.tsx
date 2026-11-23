/**
 * The About surface's content, shared by the settings page and the desktop
 * dialog.
 *
 * Both surfaces render the same facts: the product mark, the build version, the
 * installation's registered app id, the deployment identity the platform
 * verified, and the product links. Only the framing differs, so the two stay in
 * step and a copy change can never reach one without the other.
 */
import { useId, type ReactNode } from 'react'
import clsx from 'clsx'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  BirdLogo, IconRefreshOutlineRegular,
  IconRightUpOutlineRegular, IconWarningTriangleOutlineRegular, useClipboardCopy,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AboutDeploymentMode, AboutEnvironmentTier, AboutInstallationFacts,
  AboutProductFacts, AboutReleaseScope,
} from './installation-facts.ts'
import {
  SHIPPED_PRODUCT_APP_KEY, SHIPPED_PRODUCT_LINKS, SHIPPED_PRODUCT_VENDOR,
} from './installation-facts.ts'
import type {
  AboutAppMode, AboutInstallationSnapshot, AboutLocalFacts, AboutUnavailableReason,
} from './about-runtime.ts'
import type { AboutKey } from './locales.ts'
import css from './AboutContent.module.css'

/** Localized copy seat of the About surface. */
export type AboutTranslate = Translate<AboutKey>

/** Which framing renders the content. */
export type AboutVariant = 'page' | 'dialog'

/** Props of the shared About content. */
export interface AboutContentProps {
  /** Localized copy. */
  t: AboutTranslate
  /** This build's local facts. */
  local: AboutLocalFacts
  /** The platform application read. */
  installation: AboutInstallationSnapshot
  /** Page framing inside settings, or compact dialog framing. */
  variant: AboutVariant
  /** Re-read the installation application. */
  onRefresh: () => void
}

const ENVIRONMENT_KEYS: Record<AboutEnvironmentTier, AboutKey> = {
  development: 'value.environment.development',
  testing: 'value.environment.testing',
  production: 'value.environment.production',
}

const MODE_KEYS: Record<AboutDeploymentMode, AboutKey> = {
  saas: 'value.mode.saas',
  private: 'value.mode.private',
  local: 'value.mode.local',
}

const APP_MODE_KEYS: Record<AboutAppMode, AboutKey> = {
  desktop: 'value.appMode.desktop',
  web: 'value.appMode.web',
}

const SCOPE_KEYS: Record<AboutReleaseScope, AboutKey> = {
  TENANT: 'value.scope.TENANT',
  ORGANIZATION: 'value.scope.ORGANIZATION',
  USER: 'value.scope.USER',
}

/** Copy that reports only the platform-independent state. */
function statusKey(installation: AboutInstallationSnapshot): AboutKey {
  switch (installation.phase) {
    case 'ready': return 'status.connected'
    case 'loading': return 'status.loading'
    default: return 'status.local'
  }
}

/** The localized explanation for a platform read that produced no facts. */
function noticeKey(reason: AboutUnavailableReason): AboutKey {
  switch (reason) {
    case 'unconfigured': return 'notice.unconfigured'
    case 'unauthenticated': return 'notice.unauthenticated'
    case 'invalid': return 'notice.invalid'
    default: return 'notice.failed'
  }
}

/**
 * Render one information row.
 * @param props - localized label, value, optional copy target, and loading state.
 * @returns the row element.
 */
function FieldRow({
  label, value, t, mono = false, copyText, pending = false,
}: {
  label: string
  value: string
  t: AboutTranslate
  mono?: boolean
  copyText?: string | undefined
  pending?: boolean
}) {
  return (
    <div className={css.row} aria-busy={pending ? 'true' : undefined}>
      <span className={css.rowLabel}>{label}</span>
      {pending
        ? <span className={css.skeleton} aria-hidden="true" />
        : (
          <span className={css.rowValue}>
            {copyText === undefined
              ? <span className={clsx(css.value, mono && css.mono)} title={value}>{value}</span>
              : <CopyValue display={value} text={copyText} label={label} t={t} mono={mono} />}
          </span>
        )}
    </div>
  )
}

/**
 * Copy one exact value by clicking its text, with local success feedback.
 *
 * The value itself is the control: it reads as plain text, turns into a pointer
 * on hover, and swaps to the localized success label for one second after the
 * clipboard write so the row never grows a second alignment edge.
 * @param props - the displayed value, the exact text to copy, its row label, and localized copy.
 * @returns the clickable value.
 */
function CopyValue({
  display, text, label, t, mono,
}: {
  display: string
  text: string
  label: string
  t: AboutTranslate
  mono: boolean
}) {
  const { copied, onCopy } = useClipboardCopy(text)
  return (
    <button
      type="button"
      className={clsx(css.value, css.copyValue, mono && css.mono, copied && css.copiedValue)}
      aria-label={copied ? t('action.copied') : `${t('action.copy')} ${label}`}
      title={copied ? t('action.copied') : text}
      onClick={onCopy}
    >
      {copied ? t('action.copied') : display}
    </button>
  )
}

/**
 * Render one section card.
 * @param props - heading, optional hint, and the rows.
 * @returns the card element.
 */
function Card({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section className={css.card} aria-labelledby={titleId}>
      <h3 className={css.cardTitle} id={titleId}>{title}</h3>
      <div className={css.rows}>{children}</div>
    </section>
  )
}

/** Product links shown for the resolved installation or the shipped identity. */
function productLinks(product: AboutProductFacts | undefined) {
  if (product === undefined) return SHIPPED_PRODUCT_LINKS
  return {
    websiteUrl: product.websiteUrl || SHIPPED_PRODUCT_LINKS.websiteUrl,
    supportUrl: product.supportUrl || SHIPPED_PRODUCT_LINKS.supportUrl,
    privacyPolicyUrl: product.privacyPolicyUrl || SHIPPED_PRODUCT_LINKS.privacyPolicyUrl,
    termsOfServiceUrl: product.termsOfServiceUrl || SHIPPED_PRODUCT_LINKS.termsOfServiceUrl,
  }
}

/**
 * Render the About facts and links.
 * @param props - localized copy, local facts, the platform read, framing, and refresh action.
 * @returns the shared About content tree.
 */
export function AboutContent({ t, local, installation, variant, onRefresh }: AboutContentProps) {
  const application: AboutInstallationFacts | undefined =
    installation.phase === 'ready' ? installation.application : undefined
  const product = application?.product
  const loading = installation.phase === 'loading'
  const productName = product?.name ?? t('hero.productName')
  const version = local.version
  // The registered id is the platform's answer only: this page never presents a
  // local token claim or deployment anchor as the registered application.
  const registeredAppId = application?.appId
  const appKey = product?.appKey ?? SHIPPED_PRODUCT_APP_KEY
  const environment = application?.environment ?? local.environment
  const mode = application?.deploymentMode
  const scope = application?.releaseScope
  const organization = application?.organizationId
  const tenant = application?.tenantId
  const links = productLinks(product)
  const vendor = product?.vendor ?? SHIPPED_PRODUCT_VENDOR
  const shortCommit = local.commit === undefined ? undefined : local.commit.slice(0, 7)
  const commitLabel = shortCommit === undefined
    ? undefined
    : shortCommit + (local.dirty ? t('value.commitDirty') : '')
  const showOrganization = scope === 'ORGANIZATION' && organization !== undefined && organization !== '0'

  return (
    <div className={clsx(css.surface, variant === 'dialog' ? css.dialogSurface : css.pageSurface)}>
      <header className={css.hero}>
        <span className={css.mark} aria-hidden="true">
          <BirdLogo size={variant === 'dialog' ? 40 : 52} />
        </span>
        <div className={css.identity}>
          <div className={css.nameRow}>
            <h2 className={css.name} title={productName}>{productName}</h2>
            <span className={css.versionChip}>
              {version === undefined ? t('version.unknown') : t('version.chip', { version })}
            </span>
          </div>
          <p className={css.tagline}>{t('hero.tagline')}</p>
          <span className={clsx(css.status, css[`status_${installation.phase}`])}>
            <span className={css.statusDot} aria-hidden="true" />
            {t(statusKey(installation))}
          </span>
        </div>
        {variant === 'page' && (
          <button type="button" className={css.refresh} onClick={onRefresh}>
            <IconRefreshOutlineRegular size={14} />
            <span>{t('action.refresh')}</span>
          </button>
        )}
      </header>

      {installation.phase === 'unavailable' && (
        <div className={css.notice} role="status">
          <IconWarningTriangleOutlineRegular size={16} className={css.noticeIcon} />
          <div className={css.noticeBody}>
            <p className={css.noticeText}>{t(noticeKey(installation.reason))}</p>
            {installation.detail === undefined ? null : (
              <details className={css.details}>
                <summary>{t('notice.detail')}</summary>
                <pre className={css.detailText}>{installation.detail}</pre>
              </details>
            )}
          </div>
          <button type="button" className={css.retry} onClick={onRefresh}>{t('action.retry')}</button>
        </div>
      )}

      <Card title={t('section.application')}>
        <FieldRow label={t('field.version')} value={version ?? t('value.unknown')} t={t} copyText={version} />
        <FieldRow
          label={t('field.appId')}
          value={registeredAppId ?? t('value.notAvailable')}
          t={t}
          mono
          copyText={registeredAppId}
          pending={loading && registeredAppId === undefined}
        />
        <FieldRow label={t('field.appKey')} value={appKey} t={t} mono />
        <FieldRow label={t('field.vendor')} value={vendor} t={t} />
      </Card>

      <Card title={t('section.deployment')}>
        <FieldRow label={t('field.appMode')} value={t(APP_MODE_KEYS[local.appMode])} t={t} />
        <FieldRow label={t('field.environment')} value={t(ENVIRONMENT_KEYS[environment])} t={t} />
        <FieldRow
          label={t('field.deploymentMode')}
          value={mode === undefined ? t('value.unknown') : t(MODE_KEYS[mode])}
          t={t}
          pending={loading && mode === undefined}
        />
        <FieldRow
          label={t('field.releaseScope')}
          value={scope === undefined ? t('value.unknown') : t(SCOPE_KEYS[scope])}
          t={t}
          pending={loading && scope === undefined}
        />
        <FieldRow
          label={t('field.tenant')}
          value={tenant ?? t('value.unknown')}
          t={t}
          mono
          pending={loading && tenant === undefined}
        />
        {showOrganization && (
          <FieldRow label={t('field.organization')} value={organization} t={t} mono />
        )}
        <FieldRow
          label={t('field.apiBaseUrl')}
          value={local.apiBaseUrl === '' ? t('value.unknown') : local.apiBaseUrl}
          t={t}
          mono
          copyText={local.apiBaseUrl === '' ? undefined : local.apiBaseUrl}
        />
        {commitLabel !== undefined && (
          <FieldRow
            label={t('field.commit')}
            value={commitLabel}
            t={t}
            mono
            copyText={local.commit}
          />
        )}
      </Card>

      <section className={css.card} aria-label={t('section.links')}>
        <h3 className={css.cardTitle}>{t('section.links')}</h3>
        <div className={css.links}>
          <LinkRow href={links.websiteUrl} label={t('link.website')} />
          <LinkRow href={links.supportUrl} label={t('link.support')} />
          <LinkRow href={links.privacyPolicyUrl} label={t('link.privacy')} />
          <LinkRow href={links.termsOfServiceUrl} label={t('link.terms')} />
        </div>
      </section>

      <p className={css.copyright}>
        {t('footer.copyright', { year: String(new Date().getFullYear()), vendor })}
      </p>
    </div>
  )
}

/**
 * Render one external product link.
 * @param props - destination and localized label.
 * @returns the link element, opened outside the application.
 */
function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a className={css.link} href={href} target="_blank" rel="noreferrer noopener">
      <span>{label}</span>
      <IconRightUpOutlineRegular size={12} className={css.linkIcon} />
    </a>
  )
}
