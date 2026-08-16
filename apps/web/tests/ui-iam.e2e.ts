// Web e2e: the SDKWork IAM integration — the settings-menu sign-in gesture
// works before any configuration (the modal opens into the configuration
// notice); an absent `ui-env` section resolves the base URL to the default
// api.sdkwork.com origin, which drives the account rail entry and the modal
// auth surface; a configured `ui-env` profile base URL swaps in the stub
// server.
// Zero model calls; a stub IAM server answers the endpoints the auth page
// touches on render (verification policy + scan-login modes), and the
// default origin is route-intercepted with the same responses, so the login
// form renders without a live backend in every state.
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Browser, Page, Route } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

/** The default IAM app-api origin the unconfigured baseUrl resolves to. */
const DEFAULT_IAM_BASE_URL = 'https://api.sdkwork.com'

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
      // The welcome's acknowledge write can stall on a cold first write;
      // retry rather than block the surface on it.
      await cont.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)
      continue
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

/** A stub IAM app-api answering the render-time endpoints the auth page touches. */
function stubIamServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (url.includes('/system/iam/verification_policy')) {
      res.writeHead(200)
      res.end(JSON.stringify({
        code: 0,
        data: {
          emailCodeLoginEnabled: false,
          emailRegistrationVerificationRequired: false,
          phoneCodeLoginEnabled: false,
          phoneRegistrationVerificationRequired: false,
        },
      }))
      return
    }
    if (url.includes('/oauth/scan_login_modes')) {
      res.writeHead(200)
      res.end(JSON.stringify({ code: 0, data: { items: [], total: 0 } }))
      return
    }
    res.writeHead(404)
    res.end(JSON.stringify({ code: 404, message: 'not stubbed' }))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((resolveClose) => {
          server.close(() => { resolveClose() })
        }),
      })
    })
  })
}

/** Fulfill one request against the DEFAULT IAM origin with the stub's responses. */
async function fulfillDefaultOrigin(route: Route): Promise<void> {
  const url = route.request().url()
  if (url.includes('/system/iam/verification_policy')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        code: 0,
        data: {
          emailCodeLoginEnabled: false,
          emailRegistrationVerificationRequired: false,
          phoneCodeLoginEnabled: false,
          phoneRegistrationVerificationRequired: false,
        },
      }),
    })
    return
  }
  if (url.includes('/oauth/scan_login_modes')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: 0, data: { items: [], total: 0 } }),
    })
    return
  }
  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ code: 404, message: 'not stubbed' }),
  })
}

describe('web e2e: the SDKWork IAM integration', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let iam: { baseUrl: string; close: () => Promise<void> }
  let defaultOriginRequests: number

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    iam = await stubIamServer()
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    // Boot with an EXPLICITLY empty ui-env production profile: the schema
    // default is the api.sdkwork.com origin, so the unconfigured gesture
    // needs the document to say empty. The configuration lands mid-suite
    // below.
    await mkdir(scaffold.harnessHome, { recursive: true })
    await writeFile(join(scaffold.harnessHome, 'settings.yaml'), "ui-env:\n  production:\n    apiBaseUrl: ''\n")
    // The default origin is intercepted with the stub's responses, so the
    // default-baseUrl auth surface renders hermetically. The counter proves
    // the default origin actually serves the default-state auth surface.
    defaultOriginRequests = 0
    page.on('request', (request) => {
      if (request.url().startsWith(DEFAULT_IAM_BASE_URL)) defaultOriginRequests += 1
    })
    await page.route(`${DEFAULT_IAM_BASE_URL}/**`, (route) => { void fulfillDefaultOrigin(route) })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await iam?.close()
  })

  it('opens the sign-in dialog from the settings menu even before the IAM base URL is configured', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-menu-unconfigured'))
    await page.waitForTimeout(6000)
    await dismissOnboarding(page)
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    // The plugin's account seam advertises the sign-in row while signed out,
    // with no configuration required.
    await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
    // The gesture always lands in a dialog: unconfigured it shows the
    // configuration notice instead of the auth surface.
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByText('未配置 IAM 服务', { exact: true }).waitFor({ timeout: 10_000 })
    expect(tripwire.pageErrors).toEqual([])
    // Close the notice dialog before the configuration lands.
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)
  })

  it('treats an absent ui-env section as the default api.sdkwork.com base URL', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-default-base-url'))
    // Remove the section: the settings document hot-reloads, and the scope
    // resolves the base URL to the schema default. The empty document also
    // drops the onboarding acknowledgment, so dismiss the first-run dialogs
    // before driving the menu.
    await writeFile(join(scaffold.harnessHome, 'settings.yaml'), '{}\n')
    await dismissOnboarding(page)
    // The default origin drives the auth surface: the modal opens into the
    // login form served by the route-intercepted default origin.
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('button', { name: '登录', exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => defaultOriginRequests, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(tripwire.pageErrors).toEqual([])
    // The sdkwork auth modal's dismiss control carries its default copy.
    await dialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)
  })

  it('serves the configured ui-env profile base URL to the auth surface', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-stub-base-url'))
    // Configure the active environment's apiBaseUrl: the settings document
    // hot-reloads, and the modal auth surface renders against the stub.
    await writeFile(join(scaffold.harnessHome, 'settings.yaml'), `ui-env:
  environment: production
  production:
    apiBaseUrl: ${iam.baseUrl}
`)
    await dismissOnboarding(page)
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('button', { name: '登录', exact: true }).waitFor({ timeout: 15_000 })
    expect(tripwire.pageErrors).toEqual([])
    await dialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)
  })

  it('mounts the full-page auth surface in the account mode', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-account-page'))
    // The page presentation routes the settings-menu gesture into the
    // account mode, which mounts the full-page auth surface. The setting
    // lands asynchronously, so an early gesture may open the modal first;
    // close it and retry until the page mounts.
    await writeFile(join(scaffold.harnessHome, 'settings.yaml'), `ui-env:
  environment: production
  production:
    apiBaseUrl: ${iam.baseUrl}
ui-iam:
  presentation: page
`)
    await dismissOnboarding(page)
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await trigger.hover()
      await page.getByRole('menu').waitFor({ timeout: 10_000 })
      await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
      await page.waitForTimeout(300)
      const dialog = page.getByRole('dialog')
      if (await dialog.count() > 0) {
        await dialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
        await page.waitForTimeout(1000)
        continue
      }
      break
    }
    // The sdkwork password login form owns the center column.
    await page.getByRole('button', { name: '登录', exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.getByPlaceholder(/密码|Password/i).count()).toBeGreaterThan(0)
    expect(tripwire.pageErrors).toEqual([])
    // Restore the modal presentation for the following specs.
    await writeFile(join(scaffold.harnessHome, 'settings.yaml'), `ui-env:
  environment: production
  production:
    apiBaseUrl: ${iam.baseUrl}
`)
  })

  it('opens the modal sign-in host from the settings-menu account seam', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-modal'))
    await dismissOnboarding(page)
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    // The modal presentation setting lands asynchronously after the previous
    // spec restores it; retry the gesture until the modal actually opens.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await trigger.hover()
      await page.getByRole('menu').waitFor({ timeout: 10_000 })
      await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
      await page.waitForTimeout(300)
      if (await page.getByRole('dialog').count() > 0) break
      await page.waitForTimeout(1000)
    }
    // The modal host renders the same auth surface as a dialog (the
    // full-page account surface may still show its own login button, so the
    // assertions stay scoped to the dialog).
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('button', { name: '登录', exact: true }).waitFor({ timeout: 15_000 })
    expect(tripwire.pageErrors).toEqual([])
    // Leave the modal closed for the following dark-theme spec.
    await dialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)
  })

  it('adapts the auth surface to the harness dark theme', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ui-iam-dark-mode'))
    // The sdkwork auth stack expresses themes through its appearance
    // presets (light "sdkwork", dark "midnight"), which the harness drives
    // from the resolved theme; the `dark:` utilities ride the same
    // body[data-ds-dark-theme] signal.
    const trigger = page.getByRole('button', { name: '设置', exact: true })
    const openModal = async (): Promise<ReturnType<typeof page.getByRole>> => {
      await trigger.hover()
      await page.getByRole('menu').waitFor({ timeout: 10_000 })
      await page.getByRole('menuitem', { name: '登录 / 注册', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ timeout: 15_000 })
      await dialog.getByRole('button', { name: '登录', exact: true }).waitFor({ timeout: 15_000 })
      return dialog
    }
    const closeButtonBackground = async (dialog: ReturnType<typeof page.getByRole>): Promise<string> => {
      const close = dialog.getByRole('button', { name: 'Stay on page', exact: true })
      return close.evaluate(el => getComputedStyle(el).backgroundColor)
    }
    const panelBackground = async (dialog: ReturnType<typeof page.getByRole>): Promise<string> =>
      dialog.locator('.sdkwork-auth-shell').evaluate(el => getComputedStyle(el).backgroundColor)
    const inputBackground = async (dialog: ReturnType<typeof page.getByRole>): Promise<string> =>
      dialog.locator('#sdkwork-auth-account').evaluate(el => getComputedStyle(el).backgroundColor)
    const primaryButtonBackground = async (dialog: ReturnType<typeof page.getByRole>): Promise<string> =>
      dialog.getByRole('button', { name: '登录', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor)
    // Tailwind v4 opacity modifiers compute to oklab; compare the lightness
    // channel and the alpha instead of the exact serialization.
    const oklabLightness = (background: string): number =>
      Number.parseFloat(background.match(/^oklab\(([\d.]+)/)?.[1] ?? '0')

    await dismissOnboarding(page)
    const lightDialog = await openModal()
    // The harness tokens repaint the panel, the field chrome, and the brand
    // button (deepseek bluish-1000 fill in light).
    expect(await panelBackground(lightDialog)).toBe('rgb(255, 255, 255)')
    expect(await inputBackground(lightDialog)).toBe('rgb(255, 255, 255)')
    expect(await primaryButtonBackground(lightDialog)).toBe('rgb(15, 17, 21)')
    // bg-white/95 in light; zinc-900/95 under the dark palette.
    const lightBackground = await closeButtonBackground(lightDialog)
    expect(lightBackground).toMatch(/\/ 0\.95\)/)
    expect(oklabLightness(lightBackground)).toBeGreaterThan(0.9)
    await lightDialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)

    // Switch the appearance to dark through the settings menu.
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '外观', exact: true }).hover()
    await page.getByRole('menuitem', { name: '深色', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 10_000,
    }).toBe(true)

    const darkDialog = await openModal()
    // The harness dark palette repaints the panel, the field chrome, and the
    // brand button (light bluish-50 fill with dark text in dark).
    expect(await panelBackground(darkDialog)).toBe('rgb(44, 44, 46)')
    expect(await inputBackground(darkDialog)).toBe('rgb(35, 35, 36)')
    expect(await primaryButtonBackground(darkDialog)).toBe('rgb(249, 250, 251)')
    const darkBackground = await closeButtonBackground(darkDialog)
    expect(darkBackground).toMatch(/\/ 0\.95\)/)
    expect(oklabLightness(darkBackground)).toBeLessThan(0.5)
    expect(darkBackground).not.toBe(lightBackground)
    expect(tripwire.pageErrors).toEqual([])
    await darkDialog.getByRole('button', { name: 'Stay on page', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)

    // Restore the light appearance.
    await trigger.hover()
    await page.getByRole('menu').waitFor({ timeout: 10_000 })
    await page.getByRole('menuitem', { name: '外观', exact: true }).hover()
    await page.getByRole('menuitem', { name: '浅色', exact: true }).click()
    await expect.poll(() => page.evaluate(() => !document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 10_000,
    }).toBe(true)
  })
})
