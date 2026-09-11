/**
 * The presentation colour map.
 *
 * DrawingML addresses theme colours through placeholder names (`tx1`, `bg2`),
 * and a slide master's `p:clrMap` decides which theme entry each name means.
 * WordprocessingML addresses scheme entries directly, so this hop exists only
 * for presentations and lives here rather than in the shared OOXML library.
 */
import { attr, child, NS_P } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ColorContext, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'

/** Colour-map placeholders every presentation maps, per the OOXML defaults. */
export const DEFAULT_COLOR_MAP: Readonly<Record<string, string>> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink',
}

/**
 * Read a master's or layout's colour-map override.
 * @param node - a `p:sldMaster` or `p:sldLayout` element.
 * @returns the colour map in force for parts below this one.
 */
export function readColorMap(node: Element | undefined): Readonly<Record<string, string>> {
  const map = child(node, NS_P, 'clrMap')
  if (map === undefined) return DEFAULT_COLOR_MAP
  const entries: Record<string, string> = { ...DEFAULT_COLOR_MAP }
  for (const name of Object.keys(DEFAULT_COLOR_MAP)) {
    const value = attr(map, name)
    if (value !== undefined) entries[name] = value
  }
  return entries
}

/**
 * Rebase a theme onto a colour map.
 * @param theme - the theme read from the theme part.
 * @param colorMap - the map in force for the part being parsed.
 * @returns a colour context that resolves scheme references through that map.
 */
export function withColorMap(theme: Theme, colorMap: Readonly<Record<string, string>>): ColorContext {
  return { scheme: theme.scheme, colorMap }
}
