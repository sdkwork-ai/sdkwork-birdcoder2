/**
 * The explorer's Monaco bootstrap: a lazy singleton that imports the VSCode
 * editor core plus the basic-languages tokenizers (main-thread tokenization —
 * no language-service web workers, so a read-only viewer spawns none), fills
 * the two gaps in Monaco's bundled grammars (JSON and unified diff get small
 * Monarch tokenizers), and bridges the app's token sheets into a Monaco
 * theme. The theme reads the same `--shiki-*` palette the markdown code
 * blocks render with and the `--dsw-alias-*` chrome colors, and re-resolves
 * when the body's theme attribute flips, so the editor, the chat's code
 * blocks, and the app chrome always agree on every color.
 */

/* oxlint-disable typescript/no-unsafe-argument -- Monaco's types: tsc owns this boundary. */

import type * as Monaco from 'monaco-editor'

/**
 * The editor API surface the viewer consumes: `editor.api` plus the
 * basic-languages tokenizers, deliberately NOT the worker-backed language
 * services `editor.main` would bundle.
 */
type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api.js')

let loading: Promise<MonacoApi> | undefined

/**
 * Monaco's bundled grammars miss JSON (it is a worker-backed language
 * service, which a read-only viewer must not spawn) and unified diff. These
 * Monarch tokenizers fill both gaps on the main thread — the same approach
 * the read view's Shiki grammar allowlist takes for its own gaps.
 */
const JSON_MONARCH: Monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"\s*(?=:)/, 'variable.name'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\/\/.*$/, 'comment'],
      [/[{}[\]]/, '@brackets'],
      [/[:;,]/, 'delimiter'],
    ],
  },
}

const DIFF_MONARCH: Monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      [/^@@.*$/, 'metatag'],
      [/^\+[^+]*$/, 'string'],
      [/^-[^-]*$/, 'invalid'],
      [/^diff .*$|^index .*$|^--- .*$|^\+\+\+ .*$/, 'comment'],
    ],
  },
}

/** Resolve one CSS custom property the way the token sheets declare it. */
function cssVar(name: string): string {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim()
  return value === '' ? '#000000' : value
}

/**
 * The Monaco theme token rules: TextMate scopes mapped onto the same
 * `--shiki-*` palette the css-variables Shiki theme hands the markdown code
 * blocks, so a `const` in the editor and a `const` in a chat fence share one
 * color by construction, not by coincidence.
 */
function themeRules(): Monaco.editor.IStandaloneThemeData['rules'] {
  const palette: Record<string, string> = {
    comment: cssVar('--shiki-token-comment'),
    string: cssVar('--shiki-token-string'),
    'string.escape': cssVar('--shiki-token-string-expression'),
    constant: cssVar('--shiki-token-constant'),
    'constant.numeric': cssVar('--shiki-token-constant'),
    'constant.language': cssVar('--shiki-token-keyword'),
    keyword: cssVar('--shiki-token-keyword'),
    'keyword.operator': cssVar('--shiki-token-punctuation'),
    'keyword.other.unit': cssVar('--shiki-token-parameter'),
    delimiter: cssVar('--shiki-token-punctuation'),
    tag: cssVar('--shiki-token-keyword'),
    attribute: cssVar('--shiki-token-parameter'),
    'attribute.value': cssVar('--shiki-token-string'),
    variable: cssVar('--shiki-token-constant'),
    'variable.name': cssVar('--shiki-token-function'),
    'variable.predefined': cssVar('--shiki-token-keyword'),
    function: cssVar('--shiki-token-function'),
    type: cssVar('--shiki-token-function'),
    identifier: cssVar('--shiki-token-function'),
    metatag: cssVar('--shiki-token-keyword'),
    invalid: cssVar('--shiki-token-keyword'),
    number: cssVar('--shiki-token-constant'),
  }
  return Object.entries(palette).map(([token, foreground]) => ({ token, foreground }))
}

/** Read the body theme attribute the app's token sheets cascade on. */
function darkMode(): boolean {
  return document.body.hasAttribute('data-ds-dark-theme')
}

/** Build the standalone theme data from the live token sheets. */
function themeData(): Monaco.editor.IStandaloneThemeData {
  return {
    base: darkMode() ? 'vs-dark' : 'vs',
    inherit: true,
    rules: themeRules(),
    colors: {
      'editor.background': cssVar('--dsw-alias-bg-base'),
      'editor.foreground': cssVar('--shiki-foreground'),
      'editorLineNumber.foreground': cssVar('--dsw-alias-label-tertiary'),
      'editorLineNumber.activeForeground': cssVar('--dsw-alias-label-primary'),
      'editor.lineHighlightBackground': cssVar('--dsw-alias-interactive-bg-hover'),
      'editorCursor.foreground': cssVar('--dsw-alias-label-primary'),
      'editorIndentGuide.background1': cssVar('--dsw-alias-border-l1'),
      'editorIndentGuide.activeBackground1': cssVar('--dsw-alias-border-l3'),
      'editorWidget.background': cssVar('--dsw-alias-bg-layer-1'),
      'editorWidget.border': cssVar('--dsw-alias-border-l2'),
      'editorGutter.background': cssVar('--dsw-alias-bg-base'),
      'minimap.background': cssVar('--dsw-alias-bg-base'),
      'diffEditor.insertedTextBackground': '#2f9e4420',
      'diffEditor.removedTextBackground': '#e0313120',
      'scrollbarSlider.background': cssVar('--dsw-alias-border-l2'),
      'scrollbarSlider.hoverBackground': cssVar('--dsw-alias-border-l3'),
    },
  }
}

/** The theme id the viewer registers and re-registers on theme flips. */
export const VIEWER_THEME = 'sdkwork-explorer-viewer'

/**
 * Import the editor once, register the gap-filling grammars, define the
 * bridged theme, and keep the theme fresh across the body attribute flips
 * (a MutationObserver re-resolves the palette and re-defines the theme —
 * Monaco applies re-defined themes live to open editors).
 * @returns the Monaco editor API namespace.
 */
export function loadMonaco(): Promise<MonacoApi> {
  loading ??= bootstrapMonaco()
  return loading
}

/** Import the editor core and the tokenizer contributions, then register the grammars and the bridged theme. */
async function bootstrapMonaco(): Promise<MonacoApi> {
  try {
    const [monaco] = await Promise.all([
      import('monaco-editor/esm/vs/editor/editor.api.js'),
      // The bundled tokenizer contributions (main-thread Monarch grammars —
      // deliberately NOT the worker-backed language services). 0.55 names the
      // aggregate `_.contribution`.
      // @ts-expect-error - monaco-editor 0.55 untyped deep import
      import('monaco-editor/esm/vs/basic-languages/_.contribution.js'),
    ])
    if (!monaco.languages.getLanguages().some(language => language.id === 'json')) {
      monaco.languages.register({ id: 'json' })
      monaco.languages.setMonarchTokensProvider('json', JSON_MONARCH)
    }
    if (!monaco.languages.getLanguages().some(language => language.id === 'diff')) {
      monaco.languages.register({ id: 'diff' })
      monaco.languages.setMonarchTokensProvider('diff', DIFF_MONARCH)
    }
    monaco.editor.defineTheme(VIEWER_THEME, themeData())
    // Theme flips re-resolve the palette live; open editors pick the new
    // definition up without a remount.
    new MutationObserver(() => { monaco.editor.defineTheme(VIEWER_THEME, themeData()) })
      .observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return monaco
  } catch (error: unknown) {
    // A failed chunk import (network hiccup, interrupted navigation) must not
    // poison the singleton: clear it so the next tab mount retries the load.
    loading = undefined
    throw error
  }
}
