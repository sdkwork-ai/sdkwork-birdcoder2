// Web e2e: the Experts tab of the shipped web-app composition lands on its one
// cloud catalog. This is the real-composition guard for the merged tab: it boots
// the shipped bundle patches in a real chromium, opens
// 插件·专家·技能·连接器 → 专家, and asserts the retired sub-tab split is gone and
// that the tab always draws an actionable face.
//
// Keyless: no model calls and no SDKWork sign-in. The catalog fetches its cloud
// data from api.birdcoder.com; this harness has no network, so its CORS
// failures are ignored while real page errors stay fatal.
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

  it('lands the Experts tab on the single cloud catalog', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-expert-market-gallery'))
    const market = page.getByRole('button', { name: /插件·专家·技能·连接器/u }).first()
    await market.waitFor({ timeout: 15_000 })
    await market.click()
    await page.waitForTimeout(1500)
    const tab = page.locator('[role="tab"], button').filter({ hasText: /^专家$/u }).first()
    await tab.waitFor({ timeout: 10_000 })
    await tab.click()
    await page.waitForTimeout(3000)

    const panel = await page.evaluate(() => ({
      body: (document.body.innerText || '').slice(0, 2000),
      // The two retired sub-tabs: the tab used to split into an App Store
      // catalog and the built-in package's roster panel.
      retiredChips: [...document.querySelectorAll('button, [role="tab"]')]
        .map(node => (node.textContent || '').trim())
        .filter(text => text === '专家市场' || text === '云端目录'),
      catalogs: document.querySelectorAll('[data-experts-catalog]').length,
      signIn: document.querySelectorAll('[data-markets-auth-required]').length,
      unconfigured: document.querySelectorAll('[data-markets-empty]').length,
      mine: document.querySelectorAll('[data-mine-experts-entry]').length,
      subtabStrips: document.querySelectorAll('[data-experts-subtabs]').length,
    }))
    // One view, no split: the retired chips and their strip are gone.
    expect(panel.retiredChips).toEqual([])
    expect(panel.subtabStrips).toBe(0)
    // The tab always lands on something actionable: the cloud catalog when the
    // gateway and session are ready, otherwise the shared gate or the
    // unconfigured notice — never a blank column.
    expect(panel.catalogs + panel.signIn + panel.unconfigured).toBeGreaterThan(0)
    // The my-experts entry belongs to this tab whichever face it shows.
    expect(panel.mine).toBeGreaterThan(0)
    // CORS/network failures from the cloud catalog are expected offline; any
    // other page error remains fatal.
    const realErrors = tripwire.pageErrors.filter(error => !/api\.birdcoder\.com|net::ERR_FAILED|CORS/u.test(error))
    expect(realErrors).toEqual([])
  }, 120_000)
})
