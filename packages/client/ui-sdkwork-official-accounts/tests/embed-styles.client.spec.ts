/**
 * The embed sheet's portaled-drawer geometry, asserted against the CSS on disk:
 * jsdom has no layout, so the modal spec cannot show where the page's own
 * create/edit drawer lands. Three contracts live only in this sheet —
 *
 * - the drawer and its mask start below the desktop caption strip
 *   (`--dsh-frame-chrome-top`). That strip is the window's native drag region,
 *   which hit-tests by geometry and ignores paint order, so a close control
 *   painted inside it never receives the click that would close the drawer.
 * - the drawer opens from the left, like every record drawer in the harness,
 *   while the shared page renders it on the right.
 * - the drawer paints the host's record-drawer surface alias, so it and the
 *   harness `Drawer` are one material.
 *
 * The browser lane owns the composed pixels; this pins the declarations that
 * produce them.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/officialAccountsView.css', import.meta.url)), 'utf8')

/** The body-portal drawer the page opens for create/edit. */
const DRAWER = ":is([data-sdk-ui='drawer-content'])"

/** The full-viewport masks that cover the application behind the page's drawers. */
const MASKS = ":is([data-sdk-ui='drawer-overlay'], [data-sdk-ui='modal-overlay'])"

/**
 * One rule's declarations, in source order.
 * @param selector - selector exactly as authored.
 * @returns trimmed `property: value` pairs; empty declarations are dropped.
 */
function declarations(selector: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const rule = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find(match => match[1]?.trim() === selector)
  if (rule === undefined) throw new Error(`no \`${selector}\` rule`)
  return (rule[2] ?? '').split(';').map(part => part.trim()).filter(part => part !== '')
}

describe('official-account embed geometry', () => {
  it('starts the page drawer and its masks below the desktop caption strip', () => {
    // The drawer's close control is its own single-row header; without this
    // offset the whole control sits in the native caption band and pressing it
    // drags the window instead of closing the drawer.
    expect(declarations(DRAWER)).toContain('top: var(--dsh-frame-chrome-top, 0px)')
    expect(declarations(MASKS)).toContain('top: var(--dsh-frame-chrome-top, 0px)')
  })

  it('fills the clear viewport instead of hanging past its bottom edge', () => {
    // `top` and `height: auto` replace the variant's `inset-y-0`/`h-full`, which
    // would otherwise size the panel to the whole viewport below the offset.
    expect(declarations(DRAWER)).toEqual(expect.arrayContaining(['bottom: 0', 'height: auto']))
  })

  it('opens from the left like every record drawer in the harness', () => {
    expect(declarations(DRAWER)).toEqual(expect.arrayContaining([
      'left: 0',
      'right: auto',
      'border-right-width: 1px',
      'border-left-width: 0',
    ]))
    // The page's slide direction follows its own `side="right"`; the mirror has
    // to move the closed state out to the left as well, or the panel parks
    // off-screen to the right and slides in from the wrong edge.
    expect(declarations(":is([data-sdk-ui='drawer-content'][data-state='closed'])")).toContain('translate: -100% 0')
    expect(declarations(":is([data-sdk-ui='drawer-content'][data-state='open'])")).toContain('translate: 0 0')
  })

  it('paints the host record-drawer surface, so both workspaces open one material', () => {
    // The page paints its own SDKWork panel token; the harness `Drawer` paints
    // the same alias, and the fallback keeps the page's tone on a shell that
    // predates it.
    expect(declarations(DRAWER))
      .toContain('background-color: var(--dsw-alias-bg-drawer, var(--sdk-color-surface-panel))')
  })
})
