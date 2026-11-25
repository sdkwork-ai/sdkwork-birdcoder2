// Web e2e: the built-in expert market renders inside the Experts tab of the
// shipped web-app composition. This is the real-composition guard for the
// product-visible gallery: it boots the shipped bundle patches in a real
// chromium, opens 插件·专家·技能·连接器 → 专家 → 专家市场, and asserts the
// reference gallery's browsing affordances over the 331-expert roster.
//
// Keyless: no model calls and no SDKWork sign-in. The appstore surface also
// fetches its cloud catalog from api.birdcoder.com; this harness has no network,
// so its CORS failures are ignored while real page errors stay fatal.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

/** Dismiss the first-run onboarding dialogs (welcome notice, credential step). */
async function dismissOnboarding(page: Page): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    const dialog = page.getByRole('dialog').first()
    if (await dialog.count() === 0) return
    const later = dialog.getByRole('button', { name: '稍后配置' })
    if (await later.count() > 0) {
      await later.click()
      continue
    }
    const cont = dialog.getByRole('button', { name: '继续' })
    if (await cont.count() > 0) {
      await cont.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)
      continue
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

describe('web e2e: the built-in expert market gallery', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForTimeout(8000)
    await dismissOnboarding(page)
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the expert market inside the Experts tab', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-expert-market-gallery'))
    const market = page.getByRole('button', { name: /插件·专家·技能·连接器/u }).first()
    await market.waitFor({ timeout: 15_000 })
    await market.click()
    await page.waitForTimeout(1500)
    const tab = page.locator('[role="tab"], button').filter({ hasText: /^专家$/u }).first()
    await tab.waitFor({ timeout: 10_000 })
    await tab.click()
    await page.waitForTimeout(2000)
    const builtIn = page.locator('button, [role="tab"], a').filter({ hasText: /^专家市场$/u }).first()
    await builtIn.waitFor({ timeout: 10_000 })
    await builtIn.click()
    await page.waitForTimeout(3000)

    const panel = await page.evaluate(() => ({
      body: (document.body.innerText || '').slice(0, 2000),
      chips: [...document.querySelectorAll('.aag-chip')].map(el => (el.textContent || '').trim()),
      cards: document.querySelectorAll('[data-expert-index]').length,
    }))
    // The reference gallery's category chip rail, sort control and roster tabs.
    expect(panel.chips).toContain('全部分类')
    expect(panel.chips).toContain('综合')
    expect(panel.chips).toContain('启用优先')
    expect(panel.chips).toContain('名称')
    expect(panel.body).toContain('专家团')
    expect(panel.body).toContain('331')
    expect(panel.cards).toBeGreaterThan(0)
    // CORS/network failures from the cloud catalog are expected offline; any
    // other page error remains fatal.
    const realErrors = tripwire.pageErrors.filter(error => !/api\.birdcoder\.com|net::ERR_FAILED|CORS/u.test(error))
    expect(realErrors).toEqual([])
  }, 120_000)
})
