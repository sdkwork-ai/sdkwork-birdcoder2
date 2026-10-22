/**
 * The embedded-app containing block as CSS text. jsdom has no layout, so the
 * frame specs pin the mode-page DOM but cannot show where an embedded app's
 * fixed preview lands; this reads the declaration that keeps it inside the
 * page and clear of the Desktop window chrome.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ' ')

/** The selector and declaration block of the rule whose selector list names `needle`. */
function ruleOf(needle: string): { selector: string; body: string } {
  const rule = new RegExp(`(?:^|[{}])\\s*([^{}]*${needle}[^{}]*)\\{([^{}]*)\\}`).exec(css)
  if (rule === null) throw new Error(`no rule naming ${needle}`)
  return { selector: rule[1] ?? '', body: rule[2] ?? '' }
}

it('contains an embedded app surface inside the mode page under Desktop window chrome', () => {
  // Without a containing block of its own, the app's position: fixed preview
  // covers the whole document and its controls land under the Windows caption
  // (menus and window buttons) or the macOS traffic lights. The surface box
  // starts below that chrome, so layout containment is the fix; only Desktop
  // sets these markers, and plain Web documents keep the full-viewport layer.
  const { selector, body } = ruleOf('data-sdk-surface')
  expect(selector).toContain('[data-windows-titlebar]')
  expect(selector).toContain("[data-platform='darwin']")
  expect(selector).toContain('[data-mode-page]')
  expect(body).toContain('contain: layout')
})
