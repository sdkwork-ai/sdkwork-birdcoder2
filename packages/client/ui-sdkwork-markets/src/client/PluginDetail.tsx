/**
 * The plugin detail page: what the market opens when a card or a roster row is
 * clicked.
 *
 * This is the market's half of the capability the upstream Plugin manager has
 * always had and the fork's market was missing: a listing is a set of doors,
 * not a wall. Upstream's Official group renders each configuration plugin as a
 * card whose head opens that plugin's own page, and its bundle cards open the
 * bundle's page; the page then renders whatever the plugin registered for
 * itself. Before this, the market's official cards carried no click target at
 * all, so a plugin's settings page was reachable from nowhere in the product.
 *
 * Four subjects share one page shape. The first three are upstream's, one per
 * detail component there:
 *
 * - an **item** (`plugins.item`) — a plugin that registered a configuration
 *   page of its own, rendered through that registration;
 * - a **bundle** — its own configuration (`plugins.bundle.config`, when one is
 *   registered) plus the rows its patch declares, each row offering a
 *   configure control when it registered one (`plugins.row.config`);
 * - a **row** — one declared row of a bundle, with the form that row
 *   registered.
 *
 * The fourth is the fork's own case, because the fork's Installed tab is a flat
 * roster where upstream's page has only bundle cards: an **entry** of the
 * running tree. The upstream seat contract has no subject for a bare Loader
 * entry — a `PluginsSubject` is a bundle, a row, or an official plugin id — so
 * an entry page renders no `plugins.detail.*` contributions rather than
 * borrowing an identity it does not own. What it does render is the deployment's
 * own settings channel for that entry, or the words that say the deployment
 * ships none.
 *
 * The registered views are not rendered here: this component is handed a
 * `config` node that the page built from its slot face. Keeping the slot calls
 * at the page is what lets one component serve all four subjects without
 * knowing which slots exist.
 *
 * A subject the deployment cannot configure says so. It never renders an empty
 * form and never a disabled control standing in for a page that does not exist:
 * most Loader entries carry no configuration at all, and the page is the place
 * that can explain that rather than hide it.
 */

import type { ReactNode } from 'react'
import { IconChevronLeftOutlineRegular, IconPluginPinwheelOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ConfigPageForm, PluginActivationOwnerProps, PluginPackageRef, PluginsSubject,
} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { MarketsKey } from './locales.ts'
import type { OfficialItem } from './configItems.ts'
import css from './OfficialPluginsPanel.module.css'

/** One declared row of a bundle, as the detail page renders it. */
export type DetailRow = BundleInfo['rows'][number]

/**
 * One Loader entry of the running tree, as its page renders it.
 *
 * The roster that produces this resolves its own display copy (origin,
 * enablement, lifecycle) from its own vocabulary, so it hands the page the
 * labels as text: the page owns `detail.*` and the roster owns `official.*`,
 * and neither dictionary has to be restated in the other. The entry id is the
 * bare id the settings namespace is named after, which is the identity this
 * page is really about.
 */
export interface DetailEntry {
  /** The entry's Loader id as the inventory reports it (the roster's row key). */
  readonly key: string
  /** The same id without the composition-only `include:` marker: the settings namespace. */
  readonly entryId: string
  /** The display name derived from the module specifier. */
  readonly name: string
  /** The exact module specifier. */
  readonly moduleName: string
  /** Whether the entry runs in this deployment (the head switch's own state). */
  readonly enabled: boolean
  /** The origin label the roster resolved. */
  readonly originLabel: string
  /** The enablement label the roster resolved. */
  readonly stateLabel: string
  /** The lifecycle label the roster resolved. */
  readonly phaseLabel: string
}

/** What one detail page is about. */
export type PluginDetailTarget =
  | { readonly kind: 'item'; readonly item: OfficialItem }
  | { readonly kind: 'bundle'; readonly bundle: BundleInfo }
  | { readonly kind: 'row'; readonly bundle: BundleInfo; readonly row: DetailRow }
  | { readonly kind: 'entry'; readonly row: DetailEntry }

/**
 * The page's render face for the seats this plugin's page hosts. The page
 * builds it once from its own `renderSlot`, so every component below draws the
 * registrants' views without a slot call of its own.
 */
export interface MarketsPluginSlots {
  /** One configuration plugin's one-liner (`view: 'summary'`). */
  itemSummary: (id: string) => ReactNode
  /** One configuration plugin's own page (`view: 'page'`), with the Host form when it has one. */
  itemPage: (id: string, form: ConfigPageForm | undefined) => ReactNode
  /** One bundle's page-level form (`plugins.bundle.config`). */
  bundleConfig: (name: string) => ReactNode
  /** One row's own page (`plugins.row.config`). */
  rowConfig: (key: string, form: ConfigPageForm | undefined) => ReactNode
  /** A head control contributed for a bundle, a row, or an official plugin. */
  detailActions: (subject: PluginsSubject) => ReactNode
  /** A tag contributed beside a detail page's title. */
  detailBadge: (subject: PluginsSubject) => ReactNode
  /** A section contributed under a detail page's own content. */
  detailSection: (subject: PluginsSubject) => ReactNode
  /** Post-enable guidance for one bundle the person just switched on. */
  activation: (owner: PluginActivationOwnerProps, name: string) => ReactNode
}

/** The translate seat of the markets namespace. */
type Translate = (key: MarketsKey, params?: Record<string, string>) => string

/**
 * One bundle as the detail slots see it: the facts a contribution decides on.
 * The fork's `BundleRowInfo` carries no per-row enablement of its own — a row
 * runs when its bundle is on and the row has a live entry — so that is what the
 * reference reports.
 * @param bundle - the bundle as the Host listed it.
 * @returns the reference the `plugins.detail.*` entries receive.
 */
export function bundleReference(bundle: BundleInfo): PluginPackageRef {
  return {
    name: bundle.name,
    ...bundle.version === undefined ? {} : { version: bundle.version },
    installed: bundle.installed,
    enabled: bundle.enabled,
    rows: bundle.rows.map(row => ({
      rowId: row.rowId,
      moduleName: row.moduleName,
      enabled: bundle.enabled && row.entryId !== undefined,
    })),
  }
}

/**
 * The subject one target presents to the detail seats, or `undefined` for a
 * subject the upstream seat contract has no case for — a bare Loader entry. An
 * entry renders no contributed detail content, which is honest: no plugin
 * registered anything against an identity that is not part of the contract.
 * @param target - the subject the open page is about.
 * @returns the contribution subject, or `undefined` when there is none.
 */
export function subjectOf(target: PluginDetailTarget): PluginsSubject | undefined {
  if (target.kind === 'entry') return undefined
  if (target.kind === 'item') return { kind: 'item', id: target.item.id }
  if (target.kind === 'row') {
    return {
      kind: 'row',
      pkg: bundleReference(target.bundle),
      row: {
        rowId: target.row.rowId,
        moduleName: target.row.moduleName,
        enabled: target.bundle.enabled && target.row.entryId !== undefined,
      },
    }
  }
  return { kind: 'bundle', pkg: bundleReference(target.bundle) }
}

/** The stable DOM identity one target carries, so both pages' subjects are addressable. */
export function detailKey(target: PluginDetailTarget): string {
  if (target.kind === 'item') return `item:${target.item.id}`
  if (target.kind === 'entry') return `entry:${target.row.key}`
  if (target.kind === 'row') return `row:${target.bundle.name}#${target.row.rowId}`
  return `bundle:${target.bundle.name}`
}

/** The crumb each subject reads under, in the order the page draws them. */
const CRUMB_KEYS = {
  item: 'detail.crumb.item',
  bundle: 'detail.crumb.bundle',
  row: 'detail.crumb.row',
  entry: 'detail.crumb.entry',
} as const satisfies Record<PluginDetailTarget['kind'], MarketsKey>

/** The kind each subject reads as, beside its crumb. */
const KIND_KEYS = {
  item: 'detail.kind.item',
  bundle: 'detail.kind.bundle',
  row: 'detail.kind.row',
  entry: 'detail.kind.entry',
} as const satisfies Record<PluginDetailTarget['kind'], MarketsKey>

/** One fact row of the page's own table. */
interface Fact {
  readonly label: MarketsKey
  readonly value: ReactNode
}

/**
 * One fact, rendered as `<dt>`/`<dd>`. Extracted so every branch of the facts
 * table builds the same markup and the page has one place to add a fact.
 *
 * The label goes through `t`: it is a locale KEY, and rendering it raw put
 * `detail.fact.module` on screen (found by the browser pass, not by a unit
 * test — the value column resolves on its own and hid the label column).
 */
function FactRow({ fact, t }: { readonly fact: Fact; readonly t: Translate }): ReactNode {
  return (
    <div className={css.detailFact}>
      <dt>{t(fact.label)}</dt>
      <dd>{fact.value}</dd>
    </div>
  )
}

/** Full props of the detail page. */
export interface PluginDetailViewProps {
  /** What the page is about. */
  readonly target: PluginDetailTarget
  readonly t: Translate
  readonly slots: MarketsPluginSlots
  /**
   * The configuration body: a registered page view, or the deployment's own
   * settings action, built by the caller from the slot face. `null` means the
   * caller knows there is nothing to render.
   */
  readonly config: ReactNode
  /** Whether {@link config} carries something the person can act on. */
  readonly configurable: boolean
  /** The write controls the head carries (a bundle's switch and uninstall). */
  readonly actions?: ReactNode
  /** The rows of one bundle, with a configure control on the rows that registered a page. */
  readonly rows?: readonly DetailRow[]
  /** Which `plugins.row.config` keys this deployment registers. */
  readonly configuredRows?: ReadonlySet<string>
  /** Open one declared row's page. */
  readonly onOpenRow?: (row: DetailRow) => void
  /** Open one row's configuration directly (a row that registered a page of its own). */
  readonly onConfigureRow?: (row: DetailRow) => void
  /** Return to the listing. */
  readonly onBack: () => void
}

/**
 * Render one plugin's page.
 *
 * @param props - the subject, its facts, the registered configuration body, and
 * the controls the listing card would otherwise carry.
 * @returns the page element tree.
 */
export function PluginDetailView({
  target, t, slots, config, configurable, actions, rows, configuredRows, onOpenRow, onConfigureRow, onBack,
}: PluginDetailViewProps): ReactNode {
  const subject = subjectOf(target)
  const crumbKey: MarketsKey = CRUMB_KEYS[target.kind]
  const kindKey: MarketsKey = KIND_KEYS[target.kind]
  // The rows section belongs to a bundle's page; hoisted so the row key can be
  // built without narrowing `target` again inside the list's callback.
  const bundleName = target.kind === 'bundle' ? target.bundle.name : ''

  /** The title, one-liner, and tags the four subjects render differently. */
  const head = ((): { title: string; description: ReactNode; tags: ReactNode; facts: readonly Fact[] } => {
    if (target.kind === 'item') {
      return {
        title: target.item.label,
        // The entry owns this line, exactly as it does on the card.
        description: slots.itemSummary(target.item.id),
        tags: null,
        facts: [
          { label: 'detail.fact.entry', value: <code data-plugin-detail-id>{target.item.id}</code> },
        ],
      }
    }
    if (target.kind === 'entry') {
      const row = target.row
      return {
        title: row.name,
        description: <code data-plugin-detail-module>{row.moduleName}</code>,
        tags: (
          <>
            <Tag tone="neutral">{row.originLabel}</Tag>
            <Tag tone={row.enabled ? 'success' : 'neutral'}>{row.stateLabel}</Tag>
            <Tag tone="neutral">{row.phaseLabel}</Tag>
          </>
        ),
        facts: [
          { label: 'detail.fact.module', value: <code>{row.moduleName}</code> },
          // The bare id is the settings namespace, so the page names the entry
          // by the identity a settings write would resolve against.
          { label: 'detail.fact.entry', value: <code data-plugin-detail-id>{row.entryId}</code> },
          { label: 'detail.fact.origin', value: row.originLabel },
          { label: 'detail.fact.state', value: row.stateLabel },
          { label: 'detail.fact.phase', value: row.phaseLabel },
        ],
      }
    }
    if (target.kind === 'row') {
      const rowFacts: Fact[] = [
        { label: 'detail.fact.row', value: <code data-plugin-detail-id>{target.row.rowId}</code> },
        { label: 'detail.fact.module', value: <code>{target.row.moduleName}</code> },
      ]
      if (target.row.entryId !== undefined) {
        rowFacts.push({ label: 'detail.fact.entry', value: <code>{String(target.row.entryId)}</code> })
      }
      return {
        title: target.row.rowId,
        description: <code data-plugin-detail-module>{target.row.moduleName}</code>,
        tags: (
          <Tag tone={target.row.entryId === undefined ? 'neutral' : 'success'}>
            {t(target.row.entryId === undefined ? 'detail.rows.dormant' : 'detail.rows.live')}
          </Tag>
        ),
        facts: rowFacts,
      }
    }
    const bundle = target.bundle
    return {
      title: bundle.name,
      description: bundle.description === undefined || bundle.description === ''
        ? null
        : <span>{bundle.description}</span>,
      tags: (
        <>
          {bundle.version === undefined ? null : <Tag tone="neutral">{bundle.version}</Tag>}
          <Tag tone={bundle.enabled ? 'success' : 'neutral'}>
            {t(bundle.enabled ? 'bundles.state.enabled' : 'bundles.state.disabled')}
          </Tag>
          {bundle.installed ? <Tag tone="neutral">{t('bundles.state.installed')}</Tag> : null}
        </>
      ),
      facts: [
        { label: 'detail.fact.name', value: <code data-plugin-detail-id>{bundle.name}</code> },
        { label: 'detail.fact.state', value: t(bundle.enabled ? 'bundles.state.enabled' : 'bundles.state.disabled') },
        { label: 'detail.fact.rows', value: String(bundle.rows.length) },
      ],
    }
  })()

  return (
    <div className={css.detail} data-plugin-detail={detailKey(target)} data-plugin-detail-kind={target.kind}>
      <div className={css.detailTop}>
        <button type="button" className={css.detailBack} data-plugin-detail-back="" onClick={onBack}>
          <IconChevronLeftOutlineRegular size={12} aria-hidden="true" />
          {t('detail.back')}
        </button>
        <span className={css.detailCrumb} data-plugin-detail-crumb={target.kind}>
          {`${t(crumbKey)} · ${t(kindKey)}`}
        </span>
      </div>
      <div className={css.detailHead}>
        {/* The same head the cards carry: the pinwheel in its framed box, then
            the identity over its one-liner. */}
        <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutlineRegular size={20} /></span>
        <div className={css.detailIdentity}>
          <div className={css.bundleTitleRow}>
            <h3 className={css.detailTitle} title={head.title}>{head.title}</h3>
            {head.tags}
            {subject === undefined ? null : slots.detailBadge(subject)}
          </div>
          {head.description === null ? null : <p className={css.bundleDesc}>{head.description}</p>}
        </div>
        <div className={css.cardActions}>
          {actions}
          {subject === undefined ? null : slots.detailActions(subject)}
        </div>
      </div>
      <dl className={css.detailFacts} data-plugin-detail-facts>
        <div className={css.detailFactsHead}>{t('detail.facts.title')}</div>
        {head.facts.map(fact => <FactRow key={fact.label} fact={fact} t={t} />)}
      </dl>
      <section className={css.detailSection} data-plugin-config data-plugin-config-present={configurable ? 'true' : 'false'}>
        <h4 className={css.detailSectionTitle}>{t('detail.section.config')}</h4>
        {configurable
          ? config
          : <p className={css.detailMissing} data-plugin-config-missing="">{t('detail.config.missing')}</p>}
      </section>
      {/* A bundle's declared rows. A row that registered a page of its own
          offers the configure control the upstream page offers; every other
          row still opens its own page from its identity, so the list is never
          a dead end. */}
      {rows === undefined ? null : (
        <section className={css.detailSection} data-plugin-detail-rows data-plugin-detail-row-count={rows.length}>
          <h4 className={css.detailSectionTitle}>{t('detail.section.rows')}</h4>
          {rows.length === 0
            ? <p className={css.detailMissing}>{t('detail.rows.none')}</p>
            : (
              <ul className={css.bundleRows}>
                {rows.map((row) => {
                  const configured = configuredRows?.has(`${bundleName}#${row.rowId}`) === true
                  return (
                    <li key={row.rowId} className={css.bundleRowItem} data-plugin-detail-row={row.rowId}>
                      {onOpenRow === undefined
                        ? <span className={css.bundleRowId}>{row.rowId}</span>
                        : (
                          <button
                            type="button"
                            className={css.rowOpen}
                            data-plugin-detail-row-open={row.rowId}
                            onClick={() => { onOpenRow(row) }}
                          >
                            {row.rowId}
                          </button>
                        )}
                      <span className={css.bundleRowModule} title={row.moduleName}>{row.moduleName}</span>
                      <span className={css.bundleRowLive}>
                        {t(row.entryId === undefined ? 'detail.rows.dormant' : 'detail.rows.live')}
                      </span>
                      {configured && onConfigureRow !== undefined && (
                        <button
                          type="button"
                          className={css.settingsButton}
                          data-plugin-detail-row-configure={row.rowId}
                          onClick={() => { onConfigureRow(row) }}
                        >
                          {t('detail.rows.configure')}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
        </section>
      )}
      {subject === undefined ? null : slots.detailSection(subject)}
    </div>
  )
}
