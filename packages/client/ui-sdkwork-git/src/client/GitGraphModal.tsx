/**
 * Git graph modal (需求: 点击「Git 图谱」弹出居中大弹窗，宽高按屏幕 70% 自适应). A
 * headless ui-primitives Modal sized near-fullscreen: sticky column header
 * (图/描述/日期/作者/提交), an SVG lane graph computed from the log rows'
 * parent topology, ref badges (HEAD, branches, remotes, tags), and a refresh
 * button. All data comes from one `git.log` read per open and per refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, GitGraph, RefreshCw, Tag } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkGitLogEntry } from '@deepseek-ai/dsh-api-sdkwork-git-controller/types'
import type { SdkworkGitPort } from './gitPort.ts'
import { computeGitGraphLanes } from './gitGraphLanes.ts'
import type { NS } from './locales.ts'
import css from './GitGraphModal.module.css'

/** Full props for the graph modal. */
export interface GitGraphModalProps {
  open: boolean
  onClose: () => void
  /** Repository directory; absent disables the fetch until a cwd exists. */
  cwd: string | undefined
  git: SdkworkGitPort
  t: TranslateNS<typeof NS>
}

/** Rows requested per graph read (the seam's ceiling is 200). */
const GRAPH_LOG_LIMIT = 200

/** Vertical rhythm of one commit row in the SVG and the grid. */
const ROW_HEIGHT = 34

/** Horizontal span of one lane in the SVG. */
const LANE_WIDTH = 14

/** Lane colors cycled by lane index (data-viz palette, both themes). */
const LANE_COLORS = [
  '#e8833a', '#4c8dff', '#3fb27f', '#b07ce8', '#d9566f', '#2fb5c9',
] as const

/** Color of one lane index. */
function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0]
}

/** Format one commit time as the product's `MM/DD HH:mm`. */
export function formatGraphDate(time: number): string {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

/**
 * The git graph modal body over the shared Modal primitive.
 * @param props - open state, close callback, repository directory, git port, locale seat.
 * @returns the modal tree, or null while closed.
 */
export function GitGraphModal({ open, onClose, cwd, git, t }: GitGraphModalProps) {
  const [entries, setEntries] = useState<readonly SdkworkGitLogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadSeed, setReloadSeed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback((): (() => void) => {
    if (cwd === undefined || cwd.trim() === '') return () => {}
    let alive = true
    setEntries(null)
    setFailed(false)
    git.log(cwd, GRAPH_LOG_LIMIT).then(
      (next) => {
        if (alive) setEntries(next)
      },
      () => {
        if (alive) setFailed(true)
      },
    )
    return () => { alive = false }
  }, [cwd, git])

  useEffect(() => {
    if (!open) return undefined
    return load()
  }, [open, load, reloadSeed])

  if (!open) return null

  const layout = entries === null ? null : computeGitGraphLanes(entries)
  const graphWidth = Math.max((layout?.laneCount ?? 1) * LANE_WIDTH, 56)

  const refresh = (): void => {
    setReloadSeed(seed => seed + 1)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('graph.title')} headless className={css.dialog}>
      <div className={css.graphRoot} data-git-graph="">
        <header className={css.header}>
          <GitGraph size={15} strokeWidth={1.75} aria-hidden="true" />
          <h2 className={css.title}>{t('graph.title')}</h2>
          <span className={css.headerSpacer} />
          <button
            type="button"
            className={css.headerButton}
            aria-label={t('graph.refresh')}
            title={t('graph.refresh')}
            disabled={entries === null && !failed}
            onClick={refresh}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
          <button type="button" className={css.headerButton} aria-label={t('graph.close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div ref={scrollRef} className={css.tableScroll}>
          <div className={css.tableHead} aria-hidden="true">
            <span className={css.colGraph}>{t('graph.col.graph')}</span>
            <span className={css.colDescription}>{t('graph.col.description')}</span>
            <span className={css.colDate}>{t('graph.col.date')}</span>
            <span className={css.colAuthor}>{t('graph.col.author')}</span>
            <span className={css.colCommit}>{t('graph.col.commit')}</span>
          </div>
          <div className={css.tableBody}>
            {entries === null && !failed && <div className={css.statusLine}>{t('popover.loading')}</div>}
            {failed && <div className={css.errorLine}>{t('popover.error')}</div>}
            {entries !== null && entries.length === 0 && (
              <div className={css.statusLine}>{t('graph.empty')}</div>
            )}
            {layout !== null && entries !== null && layout.rows.map((row, index) => {
              const entry = entries[index]
              // The last row's svg extends past the cut so its outgoing edges
              // dangle off the bottom edge, suggesting history continues.
              const last = index === layout.rows.length - 1
              return (
                <div key={entry.hash} className={css.row}>
                  <span className={css.colGraph}>
                    <svg
                      className={css.laneSvg}
                      data-lane-svg=""
                      width={graphWidth}
                      height={ROW_HEIGHT + (last ? ROW_HEIGHT / 2 : 0)}
                      viewBox={`0 0 ${graphWidth} ${ROW_HEIGHT + (last ? ROW_HEIGHT / 2 : 0)}`}
                      aria-hidden="true"
                    >
                      {row.edges.map(([from, to], edgeIndex) => {
                        const y0 = ROW_HEIGHT / 2
                        // The edge reaches the next row's node; on the last row
                        // the svg extends past the cut, so the same target
                        // dangles off the bottom edge.
                        const y1 = ROW_HEIGHT + ROW_HEIGHT / 2
                        const x0 = from * LANE_WIDTH + LANE_WIDTH / 2
                        const x1 = to * LANE_WIDTH + LANE_WIDTH / 2
                        const color = laneColor(to)
                        const bend = Math.abs(x1 - x0) / 2
                        const d = from === to
                          ? `M ${x0} ${y0} L ${x1} ${y1}`
                          : `M ${x0} ${y0} C ${x0} ${y0 + bend}, ${x1} ${y1 - bend}, ${x1} ${y1}`
                        return (
                          <path
                            key={edgeIndex}
                            d={d}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.5}
                          />
                        )
                      })}
                      <circle
                        cx={row.lane * LANE_WIDTH + LANE_WIDTH / 2}
                        cy={ROW_HEIGHT / 2}
                        r={entry.refs.head !== null ? 4 : 3}
                        fill={laneColor(row.lane)}
                        stroke={entry.refs.head !== null ? laneColor(row.lane) : 'none'}
                        strokeWidth={entry.refs.head !== null ? 1 : 0}
                        className={entry.refs.head !== null ? css.laneHeadDot : undefined}
                      />
                    </svg>
                  </span>
                  <span className={css.colDescription}>
                    <span className={css.badges}>
                      {entry.refs.head !== null && (
                        <span className={clsx(css.badge, css.badgeHead)}>
                          <GitBranch size={11} strokeWidth={2} aria-hidden="true" />
                          {t('graph.headBadge')}
                        </span>
                      )}
                      {entry.refs.head !== null && (
                        <span className={css.badge}>
                          <GitBranch size={11} strokeWidth={1.75} aria-hidden="true" />
                          {entry.refs.head}
                        </span>
                      )}
                      {entry.refs.branches.map(name => (
                        <span key={name} className={css.badge}>
                          <GitBranch size={11} strokeWidth={1.75} aria-hidden="true" />
                          {name}
                        </span>
                      ))}
                      {entry.refs.remotes.map(name => (
                        <span key={name} className={clsx(css.badge, css.badgeRemote)}>
                          <GitBranch size={11} strokeWidth={1.75} aria-hidden="true" />
                          {name}
                        </span>
                      ))}
                      {entry.refs.tags.map(name => (
                        <span key={name} className={clsx(css.badge, css.badgeTag)}>
                          <Tag size={11} strokeWidth={1.75} aria-hidden="true" />
                          {name}
                        </span>
                      ))}
                    </span>
                    <span className={css.subject}>{entry.subject}</span>
                  </span>
                  <span className={css.colDate}>{formatGraphDate(entry.time)}</span>
                  <span className={css.colAuthor}>{entry.author}</span>
                  <span className={css.colCommit}>{entry.hash.slice(0, 7)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
