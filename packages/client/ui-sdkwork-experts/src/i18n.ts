/**
 * 宿主侧用户可见文案。zh 为 key 集真相源；en 用 satisfies 校验完整性。
 * 模板占位符使用 {word}，与客户端 locale 服务约定一致。
 */
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { EN_DIVISION, ZH_DIVISION } from './names.js'
import { settingsNamespaceCompat } from './settings-compat.js'
import { normalizeAgencyLocale, personaLocale, type AgencyLocale } from './agency-locale.js'
import { ES_DIVISION, PT_DIVISION, esHost, ptHost } from './host-locales.js'

export type { AgencyLocale } from './agency-locale.js'

const LOCALE_SETTINGS_NAMESPACE = settingsNamespaceCompat('locale')

/** Legacy EN/ZH consumer contract. New host workflows use AgencyLocale. */
export type LocaleId = 'zh' | 'en'

import { zhHost, enHost, type HostKey } from './host-copy.js'
export { zhHost, enHost }
export type { HostKey }

/** Normalize explicit host preferences; omitted preferences belong to the browser. */
export const resolveHostLocale = normalizeAgencyLocale

const HOST_CATALOGS = { zh: zhHost, en: enHost, pt: ptHost, es: esHost } satisfies Record<AgencyLocale, Record<HostKey, string>>

/** 按当前语言格式化宿主文案。 */
export function formatHost(locale: AgencyLocale, key: HostKey, params?: Record<string, string | number>): string {
  const text = HOST_CATALOGS[locale][key]
  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token,
  )
}

/** 从宿主 locale.preference 读取语言；未选择（缺失或读取异常）时按 DSH 约定回退 en。实时值在 describe() 里，get() 能直接取当前快照。 */
interface HostLocaleContext {
  settings?: {
    get?: (ns: SettingsNamespace) => unknown
    describe?: () => ReadonlyArray<{ ns?: unknown; value?: unknown }>
  }
}

function preferenceOf(section: unknown): unknown {
  return section !== null && typeof section === 'object' && 'preference' in section
    ? section.preference
    : undefined
}

export function readAgencyLocale(ctx: HostLocaleContext): AgencyLocale {
  try {
    // Cordis 对未注入服务的属性访问会直接抛错，optional chaining 拦不住。
    const settings = ctx.settings
    if (typeof settings?.get === 'function') {
      const section = settings.get(LOCALE_SETTINGS_NAMESPACE)
      if (section !== undefined) return resolveHostLocale(preferenceOf(section))
    }
    const described = settings?.describe?.().find(item => item.ns === LOCALE_SETTINGS_NAMESPACE)
    return resolveHostLocale(preferenceOf(described?.value))
  } catch {
    // 读不到语言时同样不猜中文：DSH 的兜底语言是 en。
    return 'en'
  }
}

/** Adapter for callers whose catalogs only accept EN/ZH. */
export function readHostLocale(ctx: HostLocaleContext): LocaleId {
  return personaLocale(readAgencyLocale(ctx))
}

/** 工具 schema 只读语言快照；初始化、locale 激活和语言变更后才调用 describe。 */
export function createAgencyLocaleReader(ctx: Context): () => AgencyLocale {
  let current = readAgencyLocale(ctx)
  let scheduled = false
  let refreshing = false
  let disposed = false

  const scheduleRefresh = (): void => {
    if (disposed || refreshing || scheduled) return
    scheduled = true
    // describe 本身也会发设置事件，不能在其调用栈里再读 describe。
    queueMicrotask(() => {
      scheduled = false
      if (disposed) return
      refreshing = true
      try { current = readAgencyLocale(ctx) } finally { refreshing = false }
    })
  }
  ctx.on?.('settings/document-updated', (ns) => {
    if (ns === LOCALE_SETTINGS_NAMESPACE) scheduleRefresh()
  })
  ctx.on?.('internal/status', (fiber) => {
    // apply 可能早于 locale 的首次激活；不能依赖 schema 读取来纠正初始回退值。
    const entry = (fiber as { entry?: { options?: { id?: string } } }).entry
    if (fiber.state === 2 && entry?.options?.id === LOCALE_SETTINGS_NAMESPACE) scheduleRefresh()
  })
  ctx.effect?.(() => () => { disposed = true })

  return () => {
    // get() 能读到当前快照时直接用，不依赖设置事件是否已经发出。
    try {
      const settings = ctx.settings as HostLocaleContext['settings']
      const section = settings?.get?.(LOCALE_SETTINGS_NAMESPACE)
      if (section !== undefined) current = resolveHostLocale(preferenceOf(section))
    } catch {
      // 服务卸载或读取异常时保留最后一次有效语言。
    }
    return current
  }
}

/** Snapshot adapter for callers whose catalogs only accept EN/ZH. */
export function createHostLocaleReader(ctx: Context): () => LocaleId {
  const read = createAgencyLocaleReader(ctx)
  return () => personaLocale(read())
}

const DIVISIONS: Record<AgencyLocale, Readonly<Record<string, string>>> = {
  zh: ZH_DIVISION, en: EN_DIVISION, pt: PT_DIVISION, es: ES_DIVISION,
}

function divisionLabel(labels: Readonly<Record<string, string>>, division: string): string | undefined {
  return Object.hasOwn(labels, division) ? labels[division] : undefined
}

/** Match stable keys and any of the first-party display labels. */
export function matchDivision(query: string, division: string): boolean {
  const q = query.trim().toLowerCase()
  return q !== '' && (division.toLowerCase() === q
    || Object.values(DIVISIONS).some(labels => divisionLabel(labels, division)?.toLowerCase() === q))
}

/** 按当前语言取分区显示名。 */
export function localizedDivision(division: string, locale: AgencyLocale): string {
  return divisionLabel(DIVISIONS[locale], division) ?? divisionLabel(EN_DIVISION, division) ?? division
}

/** 按当前语言取专家显示名。 */
export function localizedExpertName(expert: { readonly name: string; readonly nameEn: string }, locale: AgencyLocale): string {
  return personaLocale(locale) === 'en' ? expert.nameEn : expert.name
}

/** EN/PT/ES use the English description if present, otherwise the original. */
export function localizedExpertDescription(
  expert: { readonly description: string; readonly descriptionEn?: string },
  locale: AgencyLocale,
): string {
  return personaLocale(locale) === 'en' && expert.descriptionEn !== undefined && expert.descriptionEn !== ''
    ? expert.descriptionEn
    : expert.description
}

export interface ExpertListGroup {
  readonly division: string
  readonly count: number
  readonly experts?: ReadonlyArray<{ readonly name: string; readonly emoji: string; readonly description: string }>
}

/** 渲染 list_experts 的用户可见文本。 */
export function renderExpertList(
  locale: AgencyLocale,
  args: { readonly division?: unknown },
  value: { readonly divisions: readonly ExpertListGroup[]; readonly total: number },
): string {
  if (value.divisions.length === 0) {
    const division = args.division === undefined ? '' : String(args.division).trim()
    return division === ''
      ? formatHost(locale, 'list.empty')
      : formatHost(locale, 'list.emptyDivision', { division })
  }
  const lines: string[] = []
  for (const group of value.divisions) {
    lines.push(formatHost(locale, 'list.group', {
      division: localizedDivision(group.division, locale),
      count: group.count,
    }))
    for (const expert of group.experts ?? []) {
      const mark = expert.emoji !== '' ? expert.emoji + ' ' : ''
      lines.push('- ' + mark + expert.name + ' — ' + expert.description)
    }
  }
  lines.unshift(formatHost(locale, 'list.heading', { total: value.total, count: value.divisions.length }))
  return lines.join('\n')
}

/** 渲染批量召唤结果：成功项输出答案，失败项输出本地化失败句。 */
export function renderSummonResults(
  locale: AgencyLocale,
  results: ReadonlyArray<{ readonly expert: string; readonly ok: boolean; readonly answer: string; readonly error?: string }>,
): string {
  return results.map((item) => {
    const body = item.ok ? item.answer : formatHost(locale, 'list.expertFailed', { error: item.error ?? '' })
    return '## ' + item.expert + '\n' + body
  }).join('\n\n')
}
