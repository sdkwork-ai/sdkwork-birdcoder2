// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { WindowTitle, type WindowTitleProps } from '../src/client/WindowTitle.tsx'
import { titleKeyForMode, type WindowTitleMode } from '../src/client/mode-titles.ts'
import { en, zh } from '../src/client/locales.ts'

const TITLES: Record<Exclude<WindowTitleMode, 'drive'>, string> = {
  work: '工作',
  'pull-request': 'Pull Request',
  automation: '定时任务',
  video: '视频生成',
  image: '图片生成',
  document: '文档生成',
  appstore: '应用商店',
  knowledge: '知识库',
  course: '课程',
  markets: '插件市场',
  assets: '资产',
  account: '账号',
  'token-plan': 'Token Plan',
}

/** The complete mode-to-key roster the seat resolves against. */
const MODE_KEYS: Record<WindowTitleMode, string> = {
  work: 'mode.work',
  'pull-request': 'mode.pullRequest',
  automation: 'mode.automation',
  video: 'mode.video',
  image: 'mode.image',
  document: 'mode.document',
  appstore: 'mode.appstore',
  knowledge: 'mode.knowledge',
  course: 'mode.course',
  drive: 'mode.drive',
  markets: 'mode.markets',
  assets: 'mode.assets',
  account: 'mode.account',
  'token-plan': 'mode.tokenPlan',
}

let originalTitle: string
beforeEach(() => { originalTitle = document.title })
afterEach(() => {
  try { cleanup() } finally { document.title = originalTitle }
})

function titleProps(over: Partial<WindowTitleProps> = {}): WindowTitleProps {
  return {
    mode: 'drive',
    productTitle: 'Birdcoder',
    t: (key: string) => key === titleKeyForMode('drive') ? '云盘' : key,
    ...over,
  } as unknown as WindowTitleProps
}

describe('WindowTitle', () => {
  it('names the active module in the document title and releases it on unmount', () => {
    document.title = 'stale'
    const mounted = render(<WindowTitle {...titleProps()} />)
    expect(document.title).toBe('云盘 — Birdcoder')
    mounted.unmount()
    expect(document.title).toBe('Birdcoder')
  })

  it('follows the mode and the product title', () => {
    const mounted = render(<WindowTitle {...titleProps()} />)
    mounted.rerender(<WindowTitle {...titleProps({ mode: 'knowledge', productTitle: 'Local' })} />)
    expect(document.title).toBe('mode.knowledge — Local')
  })

  it('renders no elements', () => {
    const { container } = render(<WindowTitle {...titleProps()} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('mode titles', () => {
  it('maps every non-code mode to the key both dictionaries carry', () => {
    for (const [mode, key] of Object.entries(MODE_KEYS)) {
      expect(titleKeyForMode(mode as WindowTitleMode)).toBe(key)
    }
    expect(Object.keys(MODE_KEYS)).toHaveLength(Object.keys(TITLES).length + 1)
  })

  it('keeps the documented module names', () => {
    for (const [mode, title] of Object.entries(TITLES)) {
      expect(zh[titleKeyForMode(mode as WindowTitleMode)]).toBe(title)
    }
    expect(zh['mode.drive']).toBe('云盘')
    expect(en['mode.drive']).toBe('Drive')
  })
})
