/**
 * The message-center page: the center column's message view. Selecting the
 * rail shortcut calls `layout.selectPanel('message-center')` and the frame
 * renders this component as the `main` panel instead of the current
 * conversation — no modal, and the workspace's left column stays in place.
 * The page groups notifications by local day, opens one in place, and marks an
 * unread notification read when it is opened; every product string arrives
 * through the `messageCenter` namespace.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/MessageCenterView
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronLeftOutlineRegular,
  IconCloseOutlineRegular,
  IconMailReadOutlineRegular,
  IconMailUnreadOutlineRegular,
  IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  groupMessagesByDay,
  localDayKey,
  parseMessageTime,
  safeMessageActionUrl,
  type MessageItem,
} from './message-contract.ts'
import type { MessageCenterSnapshot } from './message-service.ts'
import type { MessageLoadFailure } from './message-transport.ts'
import css from './MessageCenterView.module.css'

/** Summary length above which the row offers an expand toggle. */
const EXPANDABLE_DESC_LENGTH = 72

/** Injected business face: snapshot, read/write gestures, and navigation facts. */
export interface MessageCenterViewInjected {
  /** Subscribe to the message-center snapshot. */
  hooks: { snapshot: HostObservable<MessageCenterSnapshot> }
  /** Re-read the first page. */
  refresh: () => void
  /** Append the next page. */
  loadMore: () => void
  /** Mark one notification consumed. */
  markRead: (id: MessageItem['id']) => void
  /** Raise the in-app sign-in surface. */
  signIn: () => void
  /** Whether this composition can raise a sign-in surface. */
  canSignIn: boolean
  /** Leave the page: return the center column to the current conversation. */
  close: () => void
}

/** Full component props: the keyed `main` panel seats + injected face + locale seat. */
export type MessageCenterViewProps =
  PropsRuntime<'main'>
  & InjectFace<MessageCenterViewInjected>
  & PropsLocale<'messageCenter'>

/**
 * Render the message-center page.
 * @param props - composed slot props (injected face + locale seat).
 * @returns the page element tree.
 */
export function MessageCenterView({
  useSnapshot, refresh, loadMore, markRead, signIn, canSignIn, close, t,
}: MessageCenterViewProps) {
  const snapshot = useSnapshot(value => value)
  const [selectedId, setSelectedId] = useState<MessageItem['id'] | null>(null)
  const [expanded, setExpanded] = useState<readonly MessageItem['id'][]>([])
  const selected = snapshot.items.find(item => item.id === selectedId) ?? null
  const toggleExpanded = (id: MessageItem['id']): void => {
    setExpanded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }
  return (
    <section className={css.view} aria-label={t('title')}>
      <header className={css.header}>
        <div className={css.headerEdge}>
          {selected !== null && (
            <button type="button" className={css.iconButton} aria-label={t('action.back')} onClick={() => { setSelectedId(null) }}>
              <IconChevronLeftOutlineRegular size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className={css.headerTitle}>
          <h1 className={css.title}>{selected === null ? t('title') : t('detail.title')}</h1>
          {selected === null && snapshot.status === 'ready' && snapshot.unreadCount > 0 && (
            <p className={css.summary}>{t('summary.unread', { count: String(snapshot.unreadCount) })}</p>
          )}
        </div>
        <div className={`${css.headerEdge} ${css.headerEnd}`}>
          <button type="button" className={css.iconButton} aria-label={t('action.refresh')} onClick={refresh}>
            <IconRefreshOutlineRegular size={16} aria-hidden="true" />
          </button>
          <button type="button" className={css.iconButton} aria-label={t('close')} onClick={close}>
            <IconCloseOutlineRegular size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={css.body}>
        <div className={css.content}>
          {selected === null
            ? <CenterBody
              snapshot={snapshot}
              expanded={expanded}
              canSignIn={canSignIn}
              onRetry={refresh}
              onSignIn={signIn}
              onLoadMore={loadMore}
              onToggleExpanded={toggleExpanded}
              onOpen={(item) => {
                setSelectedId(item.id)
                if (!item.read) markRead(item.id)
              }}
              t={t}
            />
            : <MessageDetail item={selected} t={t} />}
        </div>
      </div>
    </section>
  )
}

/** The list area: one state block per lifecycle fact, otherwise the day groups. */
function CenterBody({ snapshot, expanded, canSignIn, onRetry, onSignIn, onLoadMore, onToggleExpanded, onOpen, t }: {
  snapshot: MessageCenterSnapshot
  expanded: readonly MessageItem['id'][]
  canSignIn: boolean
  onRetry: () => void
  onSignIn: () => void
  onLoadMore: () => void
  onToggleExpanded: (id: MessageItem['id']) => void
  onOpen: (item: MessageItem) => void
  t: MessageCenterViewProps['t']
}): ReactNode {
  switch (snapshot.status) {
    case 'unconfigured':
      return <StateNotice title={t('unconfigured.title')} detail={t('unconfigured.detail')} />
    case 'signed-out':
      return (
        <StateNotice title={t('error.unauthorized.title')} detail={t('error.unauthorized.detail')}>
          {canSignIn && <button type="button" className={css.primaryAction} onClick={onSignIn}>{t('action.signIn')}</button>}
        </StateNotice>
      )
    case 'loading':
      return <StateNotice title={t('loading')} detail="" />
    case 'error':
      return (
        <StateNotice title={failureText(snapshot.failure, t)} detail="">
          <button type="button" className={css.secondaryAction} onClick={onRetry}>{t('action.retry')}</button>
        </StateNotice>
      )
    case 'ready':
      if (snapshot.items.length === 0) {
        return <StateNotice title={t('empty.title')} detail={t('empty.detail')} />
      }
      return <MessageList snapshot={snapshot} expanded={expanded} onRetry={onRetry} onLoadMore={onLoadMore}
        onToggleExpanded={onToggleExpanded} onOpen={onOpen} t={t} />
    /* v8 ignore next 2 -- closed union: every MessageCenterStatus member is handled above */
    default:
      return null
  }
}

/** The grouped list with its optional refresh-failure banner and pagination row. */
function MessageList({ snapshot, expanded, onRetry, onLoadMore, onToggleExpanded, onOpen, t }: {
  snapshot: MessageCenterSnapshot
  expanded: readonly MessageItem['id'][]
  onRetry: () => void
  onLoadMore: () => void
  onToggleExpanded: (id: MessageItem['id']) => void
  onOpen: (item: MessageItem) => void
  t: MessageCenterViewProps['t']
}): ReactNode {
  const today = localDayKey(new Date())
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = localDayKey(yesterdayDate)
  const groups = groupMessagesByDay(snapshot.items)
  return (
    <>
      {snapshot.failure !== null && (
        <div className={css.banner} role="status">
          <span>{t('error.banner')}</span>
          <button type="button" className={css.bannerAction} onClick={onRetry}>{t('action.retry')}</button>
        </div>
      )}
      <section aria-label={t('list.label')}>
        {groups.map(group => (
          <div key={group.day}>
            {group.day !== '' && (
              <h2 className={css.day}>{group.day === today ? t('day.today') : group.day === yesterday ? t('day.yesterday') : group.day}</h2>
            )}
            {group.items.map(item => (
              <MessageRow key={item.id} item={item} expanded={expanded.includes(item.id)}
                onToggleExpanded={() => { onToggleExpanded(item.id) }}
                onOpen={() => { onOpen(item) }} t={t} />
            ))}
          </div>
        ))}
      </section>
      {snapshot.hasMore && (
        <div className={css.pagination}>
          <button type="button" className={css.secondaryAction} onClick={onLoadMore}>{t('action.loadMore')}</button>
        </div>
      )}
    </>
  )
}

/** One notification row: glyph, title, clamped summary, expand toggle, and the view gesture. */
function MessageRow({ item, expanded, onToggleExpanded, onOpen, t }: {
  item: MessageItem
  expanded: boolean
  onToggleExpanded: () => void
  onOpen: () => void
  t: MessageCenterViewProps['t']
}): ReactNode {
  const expandable = item.desc.length > EXPANDABLE_DESC_LENGTH
  return (
    <article className={css.message} data-unread={!item.read}>
      <span className={css.glyph} aria-hidden="true">
        {item.read
          ? <IconMailReadOutlineRegular size={18} />
          : <IconMailUnreadOutlineRegular size={18} />}
      </span>
      <div className={css.messageMain}>
        <h3 className={css.messageTitle}>
          {!item.read && <span className={css.unreadDot} aria-hidden="true" />}
          {item.title}
        </h3>
        {item.desc !== '' && (
          <p className={expanded ? `${css.messageDesc} ${css.messageDescExpanded}` : css.messageDesc}>{item.desc}</p>
        )}
        {expandable && (
          <button type="button" className={css.expandToggle} aria-expanded={expanded} onClick={onToggleExpanded}>
            {expanded ? t('action.collapse') : t('action.expand')}
          </button>
        )}
      </div>
      <button type="button" className={css.viewAction} onClick={onOpen}>{t('action.view')}</button>
    </article>
  )
}

/** The in-place detail view for one notification. */
function MessageDetail({ item, t }: {
  item: MessageItem
  t: MessageCenterViewProps['t']
}): ReactNode {
  const actionUrl = safeMessageActionUrl(item.actionUrl)
  return (
    <article className={css.detail}>
      <h2 className={css.detailTitle}>{item.title}</h2>
      <p className={css.detailTime}>{formatMessageTime(item.time)}</p>
      <div className={css.detailContent}>{item.content}</div>
      {actionUrl !== null && (
        <a className={css.detailLink} href={actionUrl} target="_blank" rel="noreferrer noopener">
          {t('detail.openLink')}
        </a>
      )}
    </article>
  )
}

/** A centered state block with an optional action row. */
function StateNotice({ title, detail, children }: {
  title: string
  detail: string
  children?: ReactNode
}): ReactNode {
  return (
    <div className={css.state} role="status">
      <p className={css.stateTitle}>{title}</p>
      {detail !== '' && <p className={css.stateDetail}>{detail}</p>}
      {children !== undefined && <div className={css.stateActions}>{children}</div>}
    </div>
  )
}

/**
 * @param failure - classified transport failure.
 * @param t - messageCenter seat.
 * @returns the localized failure sentence.
 */
function failureText(failure: MessageLoadFailure | null, t: MessageCenterViewProps['t']): string {
  switch (failure) {
    case 'unauthorized': return t('error.unauthorized.detail')
    case 'unavailable': return t('error.unavailable')
    case 'unknown':
    case null:
      return t('error.unknown')
    /* v8 ignore next 2 -- closed union: every MessageLoadFailure member is handled above */
    default:
      return t('error.unknown')
  }
}

/**
 * @param value - server publish time.
 * @returns the localized date and time, or the raw value when it does not parse.
 */
function formatMessageTime(value: string): string {
  const parsed = parseMessageTime(value)
  return parsed === null ? value : new Date(parsed).toLocaleString()
}
