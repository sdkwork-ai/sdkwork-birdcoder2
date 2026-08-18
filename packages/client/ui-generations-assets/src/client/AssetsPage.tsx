import { useEffect, useMemo, useState } from 'react'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AssetsSnapshot, GeneratedAssetItem } from './assets-service.ts'
import css from './AssetsPage.module.css'

/** Library filter categories, mirroring the SDKWork Agents asset library. */
export type AssetsFilterKind = 'all' | 'image' | 'video' | 'audio' | 'other'

/** The filter categories, in display order. */
export const ASSETS_FILTERS: readonly AssetsFilterKind[] = ['all', 'image', 'video', 'audio', 'other']

/** Map one tool-reported media kind onto the library filter categories. */
export function kindOf(mediaKind: string): Exclude<AssetsFilterKind, 'all'> {
  if (mediaKind === 'image') return 'image'
  if (mediaKind === 'video') return 'video'
  if (mediaKind === 'audio' || mediaKind === 'music' || mediaKind === 'sound-effect' || mediaKind === 'voice') return 'audio'
  return 'other'
}

/** The date bucket of one asset (RFC3339 date part), stable for grouping. */
function dateKeyOf(item: GeneratedAssetItem): string {
  return item.createdAt === undefined ? 'unknown' : item.createdAt.slice(0, 10)
}

/** Injected generated-assets page data and observable request state. */
export interface AssetsPageInjected {
  /** The keyed mode id owned by this page. */
  mode: 'assets'
  /** Start an assets list request. */
  load(): void
  hooks: {
    /** Live assets request and result state. */
    assets: HostObservable<AssetsSnapshot>
  }
}

/** Composed generated-assets page props. */
export type AssetsPageProps =
  PropsRuntime<'mode.page'>
  & InjectFace<AssetsPageInjected>
  & PropsLocale<'generationsAssets'>

/**
 * Render the SDKWork Agents generated-assets library: type filters, a
 * date-grouped grid of persisted generation results, and a detail panel for
 * one selected asset.
 * @param props - runtime data, load callback and hook, and locale seat.
 * @returns the generated-assets page.
 */
export function AssetsPage({ mode, load, useAssets, t }: AssetsPageProps) {
  const assets = useAssets(snapshot => snapshot)
  const [filter, setFilter] = useState<AssetsFilterKind>('all')
  const [selected, setSelected] = useState<GeneratedAssetItem | undefined>(undefined)

  useEffect(() => {
    if (assets.status === 'idle') load()
  }, [assets.status, load])

  const groups = useMemo(() => {
    const visible = assets.status === 'ready'
      ? assets.items.filter(item => filter === 'all' || kindOf(item.mediaKind) === filter)
      : []
    const grouped = new Map<string, GeneratedAssetItem[]>()
    for (const item of visible) {
      const key = dateKeyOf(item)
      const bucket = grouped.get(key)
      if (bucket === undefined) grouped.set(key, [item])
      else bucket.push(item)
    }
    return [...grouped.entries()]
  }, [assets, filter])

  const selectedGroup = selected === undefined
    ? undefined
    : groups.find(([, items]) => items.includes(selected))
  const selectedDate = selectedGroup === undefined ? undefined : selectedGroup[0]

  return (
    <main className={css.page} data-mode={mode} data-mode-page={mode}>
      <div className={css.content}>
        <header className={css.header}>
          <h1 className={css.title}>{t('page.title')}</h1>
          <p className={css.subtitle}>{t('page.subtitle')}</p>
        </header>

        {assets.status !== 'unconfigured' && (
          <div className={css.filters} role="group" aria-label={t('page.title')}>
            {ASSETS_FILTERS.map(kind => (
              <button
                key={kind}
                type="button"
                className={css.filter}
                aria-pressed={filter === kind}
                onClick={() => { setFilter(kind) }}
              >
                {t(`page.filter.${kind}`)}
              </button>
            ))}
          </div>
        )}

        {assets.status === 'unconfigured' && (
          <p className={css.status} role="status">{t('page.configure')}</p>
        )}
        {assets.status === 'loading' && (
          <p className={css.status} role="status">{t('page.loading')}</p>
        )}
        {assets.status === 'error' && (
          <div className={css.status} role="alert">
            <p className={css.error}>{t('page.error')}</p>
            <button type="button" className={css.button} onClick={load}>
              {t('page.retry')}
            </button>
          </div>
        )}
        {assets.status === 'ready' && groups.length === 0 && (
          <p className={css.status} role="status">{t('page.empty')}</p>
        )}

        {assets.status === 'ready' && groups.length > 0 && (
          <div className={css.library}>
            <div className={css.groups}>
              {groups.map(([date, items]) => (
                <section key={date} className={css.group} aria-labelledby={`assets-group-${date}`}>
                  <h2 id={`assets-group-${date}`} className={css.groupTitle}>
                    {date === 'unknown' ? t('page.group.unknown') : date}
                  </h2>
                  <div className={css.grid}>
                    {items.map(item => (
                      <button
                        key={`${item.driveUri}-${item.toolCallId}`}
                        type="button"
                        className={css.card}
                        aria-label={t('page.item')}
                        aria-pressed={selected === item}
                        onClick={() => { setSelected(item) }}
                      >
                        <AssetPreview item={item} className={css.preview} />
                        {item.sourceUrl === undefined && (
                          <span className={css.kindBadge}>{item.mediaKind}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {selected !== undefined && selectedDate !== undefined && (
              <aside className={css.detail} role="dialog" aria-label={t('page.detail')}>
                <header className={css.detailHeader}>
                  <h2 className={css.detailTitle}>{t('page.detail')}</h2>
                  <button
                    type="button"
                    className={css.button}
                    aria-label={t('page.detail.close')}
                    onClick={() => { setSelected(undefined) }}
                  >
                    {t('page.detail.close')}
                  </button>
                </header>
                <div className={css.detailBody}>
                  <AssetPreview item={selected} className={css.detailPreview} />
                  <dl className={css.meta}>
                    <div className={css.metaRow}>
                      <dt>{t('page.detail.tool')}</dt>
                      <dd>{selected.toolId}</dd>
                    </div>
                    <div className={css.metaRow}>
                      <dt>{t('page.detail.created')}</dt>
                      <dd>{selectedDate === 'unknown' ? t('page.group.unknown') : selectedDate}</dd>
                    </div>
                    <div className={css.metaRow}>
                      <dt>{t('page.detail.drive')}</dt>
                      <dd className={css.metaDrive}>{selected.driveUri}</dd>
                    </div>
                  </dl>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

/** Render one asset's inline media preview by its media kind. */
function AssetPreview({ item, className }: { item: GeneratedAssetItem; className: string }) {
  if (item.sourceUrl === undefined) return null
  const kind = kindOf(item.mediaKind)
  if (kind === 'image') return <img className={className} src={item.sourceUrl} alt="" />
  if (kind === 'video') return <video className={className} src={item.sourceUrl} muted />
  if (kind === 'audio') return <audio className={className} src={item.sourceUrl} controls />
  return <span className={css.kindBadge}>{item.mediaKind}</span>
}
