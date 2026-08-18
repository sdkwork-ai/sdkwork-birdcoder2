// Web e2e: the settings rail menu — hover opens the popover with the
// anonymous account header, the account group's sign-in row (advertised by
// the installed ui-iam plugin while signed out), the feature group (Settings
// / Appearance / Help / Feedback), and the disabled sign-out footer; the
// Appearance submenu flips the real theme through the full cascade (ThemeRuntime
// preference -> Host settings -> theme/change -> presenter -> body attribute);
// Help shows the placeholder toast; the Feedback row opens the feedback
// dialog (the installed ui-feedback plugin advertises the row over the
// default api.birdcoder.com base URL); the desktop-only update row is hidden on
// the web composition. Zero model calls: everything is pure client +
// persistence state on a blank frame.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, launchWebScaffold, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

describe('web e2e: the settings rail menu', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // Chinese browser: the shared page asserts the localized menu surface.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens on hover with the anonymous header, feature group, and disabled sign-out; closes by Escape and outside click', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-menu-basics'))
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    const menu = page.getByRole('menu')
    await menu.waitFor({ timeout: 10_000 })
    // The menu is its own surface: no dialog yet.
    expect(await page.getByRole('dialog', { name: '设置' }).count()).toBe(0)
    // Mutual exclusivity: no account identity header while signed out (the
    // sign-in row owns the signed-out surface).
    expect(await page.getByText('未登录', { exact: true }).count()).toBe(0)
    // The installed ui-iam plugin's account seam advertises the sign-in row
    // while signed out, with no IAM configuration required.
    expect(await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).count()).toBe(1)
    expect(await page.getByRole('menuitem', { name: '设置', exact: true }).count()).toBe(1)
    expect(await page.getByRole('menuitem', { name: '外观', exact: true }).count()).toBe(1)
    expect(await page.getByRole('menuitem', { name: '帮助', exact: true }).count()).toBe(1)
    // The installed ui-feedback plugin's seam advertises the feedback row
    // over the default api.birdcoder.com base URL.
    expect(await page.getByRole('menuitem', { name: '反馈', exact: true }).count()).toBe(1)
    // The desktop-only update row never appears on the web composition.
    expect(await page.getByRole('menuitem', { name: '检查更新', exact: true }).count()).toBe(0)
    const signOut = page.getByRole('menuitem', { name: '退出登录', exact: true })
    await signOut.waitFor({ timeout: 10_000 })
    expect(await signOut.isDisabled()).toBe(true)

    // Escape closes the menu without side effects.
    await page.keyboard.press('Escape')
    await expect.poll(() => menu.count(), { timeout: 5_000 }).toBe(0)
    expect(await trigger.getAttribute('aria-expanded')).toBe('false')

    // Outside click closes too. The pointer still sits on the trigger from
    // the first hover, so park it away first — a same-position hover emits no
    // pointerenter and cannot reopen the menu. The click lands in the rail's
    // empty spacer (below the entries, above the settings seat) — mid-page
    // positions sit over the onboarding step's settings button.
    await page.mouse.move(5, 5)
    await trigger.hover()
    await menu.waitFor({ timeout: 10_000 })
    await page.mouse.click(30, 600)
    await expect.poll(() => menu.count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('switches the theme through the Appearance submenu with a checked current preference', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-menu-appearance'))
    await page.emulateMedia({ colorScheme: 'light' })
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    const openAppearance = async (): Promise<void> => {
      await trigger.hover()
      await page.getByRole('menu').waitFor({ timeout: 10_000 })
      await page.getByRole('menuitem', { name: '外观', exact: true }).hover()
      await page.getByRole('menuitem', { name: '深色', exact: true }).waitFor({ timeout: 10_000 })
    }
    await openAppearance()
    // One glyph per row by default (leading icon only); the active preference
    // gains the trailing check marker.
    const dark = page.getByRole('menuitem', { name: '深色', exact: true })
    const light = page.getByRole('menuitem', { name: '浅色', exact: true })
    expect(await dark.locator('svg').count()).toBe(1)
    expect(await light.locator('svg').count()).toBe(1)
    await dark.click()
    // The full cascade from one menu gesture.
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(true)
    try {
      await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 10_000 })
        .toMatch(/ui-theme:\n\s+preference: dark/)
    } catch {
      // Windows rename contention can drop one host write; the controller's
      // recovery read refreshes the revision, so a second gesture persists.
      await openAppearance()
      await dark.click()
      await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 10_000 })
        .toMatch(/ui-theme:\n\s+preference: dark/)
    }

    // Reopen: the dark row now carries the selection marker.
    await openAppearance()
    expect(await dark.locator('svg').count()).toBe(2)
    expect(await light.locator('svg').count()).toBe(1)

    // Restore the shared page to the light default for the specs that follow.
    await light.click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('shows the help placeholder toast from the Help row', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-menu-help'))
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '帮助', exact: true }).click()
    const toast = page.getByRole('alert')
    await toast.waitFor({ timeout: 10_000 })
    expect(await toast.textContent()).toContain('帮助功能即将上线')
    // The toast fades on its own; the shared page sweeps itself.
    await expect.poll(() => toast.count(), { timeout: 10_000 }).toBe(0)
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('opens the feedback dialog from the Feedback row and closes it by Escape', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-menu-feedback'))
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '反馈', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '意见反馈' })
    await dialog.waitFor({ timeout: 10_000 })
    // The form surface: type group, content and contact fields, submit/cancel.
    expect(await dialog.getByRole('radiogroup', { name: '反馈类型' }).count()).toBe(1)
    expect(await dialog.getByRole('textbox', { name: '反馈内容' }).count()).toBe(1)
    expect(await dialog.getByRole('textbox', { name: '联系方式（选填）' }).count()).toBe(1)
    expect(await dialog.getByRole('button', { name: '提交反馈' }).count()).toBe(1)
    // The menu closes with the dialog open; Escape closes the dialog.
    await expect.poll(() => page.getByRole('menu').count(), { timeout: 5_000 }).toBe(0)
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('honors the ui-env environment profile from the Host settings document', async () => {
    // A dedicated home carrying the testing profile: the feedback row stays
    // advertised (the profile base URL is configured) and the feedback
    // service reads the environment's app key / access token.
    const home = join(await mkdtemp(join(tmpdir(), 'dsh-web-e2e-ui-env-')), 'home')
    await mkdir(home, { recursive: true })
    await writeFile(join(home, 'settings.yaml'), [
      'ui-env:',
      '  environment: testing',
      '  testing:',
      '    apiBaseUrl: https://api.staging.sdkwork.com',
      '    appKey: sdkwork-birdcoder-test',
      '    accessToken: env-token',
      '',
    ].join('\n'))
    const envScaffold = await launchWebScaffold({ harnessHome: home })
    const envPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const envTripwire = watchConsole(envPage)
    onTestFailed(() => saveFailureShot(envPage, 'web-e2e-settings-menu-ui-env'))
    try {
      await envPage.goto(envScaffold.baseUrl, { waitUntil: 'load' })
      await envPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      const envTrigger = envPage.getByRole('button', { name: '设置', exact: true })
      await envTrigger.hover()
      await envPage.getByRole('menu').waitFor({ timeout: 10_000 })
      // The testing profile carries a configured base URL, so the feedback
      // row appears exactly like the production default.
      expect(await envPage.getByRole('menuitem', { name: '反馈', exact: true }).count()).toBe(1)
      await envPage.getByRole('menuitem', { name: '反馈', exact: true }).click()
      await envPage.getByRole('dialog', { name: '意见反馈' }).waitFor({ timeout: 10_000 })
      await envPage.keyboard.press('Escape')
      await expect.poll(() => envPage.getByRole('dialog', { name: '意见反馈' }).count(), { timeout: 5_000 }).toBe(0)
      expect(envTripwire.pageErrors).toEqual([])
    } finally {
      await envPage.close()
      await envScaffold.close()
    }
  }, 90_000)
})
