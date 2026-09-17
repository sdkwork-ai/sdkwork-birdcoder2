/**
 * App-build menu rows: the compile and package submenus derived from one
 * workspace's catalog.
 *
 * Rows are built only from commands the catalog actually found, so a row can
 * never be a dead click. Families the standard names but this workspace
 * cannot build are appended as disabled note rows carrying the reason in
 * their tooltip — the gap stays visible instead of reading as an oversight.
 *
 * Whether a command can run here is the HOST's answer, carried per command as
 * `runnable`/`blockedBy`/`missing`; this module only renders it. Nothing here
 * may re-derive it — a renderer cannot see the build host's OS, CPU, PATH or
 * tree (see `../../../host/sdkwork-app-build/src/capability.ts`).
 *
 * Ids are `appbuild|<kind>|<familyIndex>|<commandIndex>`; the indices are
 * resolved against the catalog the menu was built from, so decoding needs no
 * second source of truth.
 */

import {
  IconArchiveOutline20, IconCodeOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AppBuildCatalog, AppBuildCommand, AppBuildFamily, AppBuildKind,
} from './contract.ts'

/** Marker every build row id starts with (the dispatch filters on it). */
const ROW_PREFIX = 'appbuild|'

/** Submenu row id for one runnable command. */
export function appBuildRowId(kind: AppBuildKind, familyIndex: number, commandIndex: number): string {
  return `${ROW_PREFIX}${kind}|${String(familyIndex)}|${String(commandIndex)}`
}

/** One decoded menu selection: the catalog command a row addresses. */
export interface AppBuildRowTarget {
  kind: AppBuildKind
  /** Catalog index of the owning family (for the menu-facing label). */
  family: AppBuildFamily
  command: AppBuildCommand
}

/**
 * Decode one menu selection back into the command it addresses.
 * @param id - the selected row id.
 * @param catalog - the catalog the menu was built from.
 * @returns the target, or undefined when the id is not a build row or no
 *   longer resolves against the catalog (a stale menu after a re-probe).
 */
export function decodeAppBuildRow(id: string, catalog: AppBuildCatalog | undefined): AppBuildRowTarget | undefined {
  if (catalog === undefined || !id.startsWith(ROW_PREFIX)) return undefined
  const parts = id.slice(ROW_PREFIX.length).split('|')
  const kind = parts[0]
  if (kind !== 'build' && kind !== 'package') return undefined
  const family = catalog.families[Number(parts[1])]
  if (family === undefined) return undefined
  const command = (kind === 'build' ? family.build : family.package)[Number(parts[2])]
  if (command === undefined) return undefined
  return { kind, family, command }
}

/** Options of the row builder. */
export interface AppBuildMenuOptions {
  /** Probed catalog, or undefined while unknown/unavailable (no rows then). */
  catalog: AppBuildCatalog | undefined
  /** Translate seat of the plugin's namespace. */
  t: (key: string, params?: Record<string, string>) => string
}

/**
 * Localized family name, falling back to the raw id for an unknown family.
 * @param familyId - catalog family id.
 * @param t - translate seat of the plugin's namespace.
 * @returns the display name; the id itself when the dictionary has no entry.
 */
export function familyName(familyId: string, t: AppBuildMenuOptions['t']): string {
  const key = `family.${familyId}`
  const name = t(key)
  // A missing dictionary entry answers the key verbatim; showing the raw id
  // beats showing `family.<id>`.
  return name === key ? familyId : name
}

/**
 * Translate with a fallback for a key the dictionary may not carry yet, since
 * a missing entry answers the key itself.
 * @param t - translate seat of the plugin's namespace.
 * @param key - dictionary key.
 * @param fallback - value to use when the dictionary has no entry.
 * @returns the localized value, or the fallback.
 */
function localized(t: AppBuildMenuOptions['t'], key: string, fallback: string): string {
  const value = t(key)
  return value === key ? fallback : value
}

/**
 * Operator-facing sentence for one blocked command: the reason plus the names
 * of what is unmet.
 *
 * Host-OS and CPU tokens are localized (`platform.macos`); tool names,
 * environment groups and entry paths are shown verbatim, because they are
 * literally what the operator has to install or create.
 * @param command - a command the host reported as not runnable.
 * @param t - translate seat of the plugin's namespace.
 * @returns the tooltip sentence.
 */
export function blockedReason(command: AppBuildCommand, t: AppBuildMenuOptions['t']): string {
  const blockedBy = command.blockedBy
  if (blockedBy === null) return t('gate.unavailable')
  const separator = localized(t, 'gate.listSeparator', ', ')
  const named = command.missing.map((token) => {
    if (blockedBy === 'platform-unsupported') return localized(t, `platform.${token}`, token)
    if (blockedBy === 'architecture-unsupported') return localized(t, `arch.${token}`, token)
    return token
  })
  return t(`gate.${blockedBy}`, { names: named.join(separator) })
}

/** Label carrying a native tooltip, used for the disabled note rows. */
function noteLabel(text: string, hint: string): MenuItem['label'] {
  return <span title={hint}>{text}</span>
}

/** Build the rows for one action kind, or undefined when it has no runnable command. */
function submenuFor(
  kind: AppBuildKind, catalog: AppBuildCatalog, t: AppBuildMenuOptions['t'],
): MenuItem[] | undefined {
  const items: MenuItem[] = []
  catalog.families.forEach((family, familyIndex) => {
    const commands = kind === 'build' ? family.build : family.package
    commands.forEach((command, commandIndex) => {
      const id = appBuildRowId(kind, familyIndex, commandIndex)
      const label = `${familyName(family.id, t)} · ${command.variant}`
      // A runnable command keeps its plain label; a blocked one is greyed with
      // the host's own reason, so the row still teaches what is missing.
      if (command.runnable) {
        items.push({ id, label })
        return
      }
      const hint = blockedReason(command, t)
      items.push({ id, label: noteLabel(label, hint), disabled: true })
    })
  })
  if (items.length === 0) return undefined
  for (const absent of catalog.missing) {
    items.push({
      id: `${ROW_PREFIX}absent|${kind}|${absent.id}`,
      label: noteLabel(
        `${familyName(absent.id, t)} — ${t(`absent.${absent.reason}`)}`,
        t(`absent.${absent.reason}`),
      ),
      disabled: true,
    })
  }
  return items
}

/**
 * Build the compile/package rows of one row menu.
 * @param options - catalog and translate seat.
 * @returns the menu entries, in menu order; empty when nothing is runnable.
 */
export function appBuildMenuRows(options: AppBuildMenuOptions): MenuEntry[] {
  const { catalog, t } = options
  if (catalog === undefined || catalog.families.length === 0) return []
  const rows: MenuEntry[] = []
  const compile = submenuFor('build', catalog, t)
  if (compile !== undefined) {
    rows.push({
      id: `${ROW_PREFIX}menu|compile`,
      label: t('menu.compile'),
      icon: <IconCodeOutline16 />,
      submenu: compile,
    })
  }
  const pack = submenuFor('package', catalog, t)
  if (pack !== undefined) {
    rows.push({
      id: `${ROW_PREFIX}menu|package`,
      label: t('menu.package'),
      icon: <IconArchiveOutline20 size={16} />,
      submenu: pack,
    })
  } else {
    // The standard separates build from package, but browser and mini-program
    // roots often publish their build output directly. Say so instead of
    // hiding the entry, which would read as a missing feature.
    rows.push({
      id: `${ROW_PREFIX}menu|package`,
      label: t('menu.package'),
      icon: <IconArchiveOutline20 size={16} />,
      submenu: [{
        id: `${ROW_PREFIX}package-none`,
        label: noteLabel(t('package.none'), t('package.none')),
        disabled: true,
      }],
    })
  }
  return rows
}
