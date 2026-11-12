/**
 * The 个人主页 (profile) settings section: the signed-in SDKWork account as a
 * personal page. It reads the account facts from the IAM service's profile
 * snapshot (one stable value per change), presents the personal account and
 * the enterprise organization the session belongs to as two tabs, lists the
 * SDKWork products that share this account, and is the second place (beside
 * the settings popover's footer row) where the account can be signed out
 * through the shared confirmation flow.
 *
 * A signed-out visitor gets the sign-in entry instead: the section is the
 * account surface, so it must never render a blank page while anonymous.
 */
import { useState } from 'react'
import clsx from 'clsx'
import {
  IconGlobeOutlineRegular, IconLinkOutlineRegular, IconRightUpOutlineRegular,
  IconUserOutlineRegular, IconUsersOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.section SlotMap row into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the account facts the IAM service publishes (shared declaration,
// not a value import of the other feature plugin).
import type { IamProfileSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import css from './ProfileSection.module.css'

/** Which account page the section shows. */
type ProfileTab = 'personal' | 'enterprise'

/** Injected business face: the live account snapshot and the two gestures. */
export interface ProfileSectionInjected {
  /** Ask the IAM service for the sign-out confirmation. */
  requestSignOut: () => void
  /** Raise the shared sign-in surface. */
  signIn: () => void
  /** Open a management-center URL in the system browser (desktop) or a new tab (web). */
  openExternal: (url: string) => void
  hooks: {
    /** The signed-in account facts; identity is stable until a fact moves. */
    profile: HostObservable<IamProfileSnapshot>
  }
}

/** Full component props: section owner share + locale seat + injected face. */
export type ProfileSectionComponentProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.profile'>
  & InjectFace<ProfileSectionInjected>

/**
 * First one or two visible characters of an account name, for the avatar tile.
 * @param profile - the account snapshot.
 * @returns the initials, uppercased for Latin names.
 */
function accountInitials(profile: IamProfileSnapshot): string {
  const name = (profile.displayName || profile.username || profile.email || '?').trim()
  const [first = '', second = ''] = Array.from(name)
  return `${first}${second}`.toUpperCase()
}

/**
 * Render one label/value pair inside an information card.
 * @param props - the localized label and the value to show.
 * @returns the row element.
 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.row}>
      <span className={css.rowLabel}>{label}</span>
      <span className={css.rowValue}>{value}</span>
    </div>
  )
}

/**
 * Render the 个人主页 settings section.
 * @param props - composed slot props (owner share, locale seat, injected face).
 * @returns the section element tree.
 */
export function ProfileSection(props: ProfileSectionComponentProps) {
  const { useProfile, requestSignOut, signIn, openExternal, t } = props
  const profile = useProfile(snapshot => snapshot)
  const [tab, setTab] = useState<ProfileTab>('personal')
  const empty = t('account.empty')

  if (!profile.signedIn) {
    return (
      <div className={css.section} data-testid="profile-section">
        <div className={css.signedOut}>
          <div className={css.signedOutIcon} aria-hidden="true">
            <IconUserOutlineRegular size={20} />
          </div>
          <div className={css.signedOutCopy}>
            <h3 className={css.signedOutTitle}>{t('signedOut.title')}</h3>
            <p className={css.signedOutDetail}>{t('signedOut.detail')}</p>
          </div>
          <button type="button" className={css.primaryButton} onClick={signIn}>
            {t('signedOut.action')}
          </button>
        </div>
      </div>
    )
  }

  const enterprise = profile.accountKind === 'enterprise'
  const managementCenterUrl = profile.managementCenterUrl

  return (
    <div className={css.section} data-testid="profile-section">
      <header className={css.header}>
        <div className={css.avatar} aria-hidden="true">{accountInitials(profile)}</div>
        <div className={css.identity}>
          <div className={css.nameRow}>
            <span className={css.name}>{profile.displayName || profile.username || empty}</span>
            <span className={clsx(css.badge, enterprise && css.badgeEnterprise)}>
              {enterprise ? t('badge.enterprise') : t('badge.personal')}
            </span>
          </div>
          <p className={css.email}>{profile.email || profile.username || empty}</p>
        </div>
        {managementCenterUrl === undefined
          ? null
          : (
            <button
              type="button"
              className={css.secondaryButton}
              onClick={() => { openExternal(managementCenterUrl) }}
            >
              {t('header.manage')}
              <IconRightUpOutlineRegular size={14} />
            </button>
          )}
      </header>

      <div className={css.tabs} role="tablist" aria-label={t('nav')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={clsx(css.tab, tab === 'personal' && css.tabActive)}
          onClick={() => { setTab('personal') }}
        >
          {t('tab.personal')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'enterprise'}
          className={clsx(css.tab, tab === 'enterprise' && css.tabActive)}
          onClick={() => { setTab('enterprise') }}
        >
          {t('tab.enterprise')}
        </button>
      </div>

      {tab === 'personal' ? (
        <div className={css.panels} role="tabpanel">
          <section className={css.card}>
            <h3 className={css.cardTitle}>{t('account.section')}</h3>
            <div className={css.rows}>
              <InfoRow label={t('account.nickname')} value={profile.displayName || empty} />
              <InfoRow label={t('account.username')} value={profile.username || empty} />
              <InfoRow label={t('account.email')} value={profile.email || empty} />
              <InfoRow label={t('account.id')} value={profile.accountId || empty} />
              <InfoRow label={t('account.kind')} value={enterprise ? t('badge.enterprise') : t('badge.personal')} />
              <InfoRow label={t('account.environment')} value={profile.environment} />
            </div>
          </section>

          <section className={css.card}>
            <h3 className={css.cardTitle}>{t('linked.section')}</h3>
            <p className={css.cardHint}>{t('linked.hint')}</p>
            <div className={css.linkedList}>
              <div className={css.linkedRow}>
                <span className={css.linkedName}>
                  <IconLinkOutlineRegular size={16} />
                  {t('linked.birdcoder')}
                </span>
                <span className={css.linkedMeta}>{t('linked.current')}</span>
                <span className={css.linkedTag}>{t('linked.primary')}</span>
              </div>
              {managementCenterUrl === undefined
                ? null
                : (
                  <div className={css.linkedRow}>
                    <span className={css.linkedName}>
                      <IconGlobeOutlineRegular size={16} />
                      {t('linked.cloudrouter')}
                    </span>
                    <span className={css.linkedMeta}>{t('linked.shared')}</span>
                    <button
                      type="button"
                      className={css.linkButton}
                      onClick={() => { openExternal(managementCenterUrl) }}
                    >
                      {t('linked.open')}
                    </button>
                  </div>
                )}
            </div>
          </section>
        </div>
      ) : (
        <div className={css.panels} role="tabpanel">
          {enterprise ? (
            <section className={css.card}>
              <h3 className={css.cardTitle}>{t('enterprise.section')}</h3>
              <div className={css.rows}>
                <InfoRow label={t('enterprise.organizationId')} value={profile.organizationId ?? empty} />
                <InfoRow label={t('enterprise.tenantId')} value={profile.tenantId ?? empty} />
              </div>
            </section>
          ) : (
            <section className={css.card}>
              <div className={css.enterpriseEmpty}>
                <div className={css.enterpriseEmptyIcon} aria-hidden="true">
                  <IconUsersOutlineRegular size={20} />
                </div>
                <div>
                  <h3 className={css.cardTitle}>{t('enterprise.empty.title')}</h3>
                  <p className={css.cardHint}>{t('enterprise.empty.detail')}</p>
                </div>
              </div>
            </section>
          )}
          {managementCenterUrl === undefined
            ? null
            : (
              <button
                type="button"
                className={css.secondaryButton}
                onClick={() => { openExternal(managementCenterUrl) }}
              >
                {enterprise ? t('enterprise.manage') : t('enterprise.learn')}
                <IconRightUpOutlineRegular size={14} />
              </button>
            )}
        </div>
      )}

      <footer className={css.footer}>
        <p className={css.footerHint}>{t('signOut.hint')}</p>
        <button
          type="button"
          className={css.signOut}
          onClick={requestSignOut}
          data-testid="profile-sign-out"
        >
          {t('signOut.action')}
        </button>
      </footer>
    </div>
  )
}
