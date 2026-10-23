// @vitest-environment jsdom
/**
 * Create-app confirmation (`DeployProjectAppDialog`): the manifest-derived
 * summary, the primary action for a derivable type card, the full-form handoff
 * when the manifest cannot determine one, the linkage-retry state, and the
 * dismiss rules (close button and backdrop, never while busy).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { zh, type DeployKey } from '../src/client/locales.ts'
import {
  DeployProjectAppDialog,
  type DeployProjectAppDialogProps,
} from '../src/client/DeployProjectAppDialog.tsx'

// Hand-rolled act() outside testing-library requires the React 19 flag.
const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

/** Translate through the plugin's zh dictionary. */
function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

let root: Root | undefined
let container: HTMLElement | undefined

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
})

/** Mount the dialog and return the container. */
async function mount(overrides: Partial<DeployProjectAppDialogProps> = {}): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployProjectAppDialogProps = {
    draft: {
      name: 'SDKWork Store',
      cardId: 'pc-web',
      description: 'Everything store.',
      appKey: 'sdkwork-store',
    },
    hasManifest: true,
    stale: false,
    intent: 'publish',
    busy: false,
    theme: 'dark',
    t: translate,
    onConfirm: vi.fn(),
    onManual: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  await act(async () => { root?.render(createElement(DeployProjectAppDialog, props)) })
  return container
}

/** The dialog's primary action button. */
function primary(element: HTMLElement): HTMLButtonElement {
  const buttons = [...element.querySelectorAll('button')]
  const button = buttons.at(-1)
  if (button === undefined) throw new Error('the dialog rendered no action button')
  return button
}

describe('DeployProjectAppDialog', () => {
  it('summarizes the manifest-derived draft and confirms creation', async () => {
    const onConfirm = vi.fn()
    const element = await mount({ onConfirm })
    expect(element.textContent).toContain('创建应用')
    expect(element.textContent).toContain('sdkwork.app.config.json')
    expect(element.textContent).toContain('SDKWork Store')
    expect(element.textContent).toContain('sdkwork-store')
    expect(element.textContent).toContain('Everything store.')
    expect(element.querySelector('[role="dialog"]')?.getAttribute('data-theme')).toBe('dark')
    expect(primary(element).textContent).toBe('创建并继续发布')
    await act(async () => { primary(element).click() })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('offers the upload continuation for an upload intent', async () => {
    const element = await mount({ intent: 'upload' })
    expect(primary(element).textContent).toBe('创建并继续上传')
  })

  it('hands off to the full form when no type card is derivable', async () => {
    const onManual = vi.fn()
    const element = await mount({
      draft: { name: 'Library' },
      hasManifest: false,
      onManual,
    })
    expect(element.textContent).toContain('无法从项目清单确定应用类型')
    expect(element.textContent).toContain('项目没有 sdkwork.app.config.json')
    expect(primary(element).textContent).toBe('打开创建表单')
    await act(async () => { primary(element).click() })
    expect(onManual).toHaveBeenCalledTimes(1)
  })

  it('announces a stale linkage the creation replaces', async () => {
    const element = await mount({ stale: true })
    expect(element.textContent).toContain('原关联的应用已不存在')
  })

  it('shows the linkage retry instead of a second create', async () => {
    const element = await mount({ retryingLink: true, error: translate('create.linkFailed') })
    expect(primary(element).textContent).toBe('重试写入项目关联')
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(translate('create.linkFailed'))
  })

  it('disables both actions while creation is in flight', async () => {
    const element = await mount({ busy: true })
    const buttons = [...element.querySelectorAll('button')]
    expect(buttons.every(button => button.disabled)).toBe(true)
    expect(primary(element).textContent).toBe('正在创建…')
  })

  it('closes from the close button and the backdrop, but not while busy', async () => {
    const onClose = vi.fn()
    const element = await mount({ onClose })
    await act(async () => { element.querySelector('button')?.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(async () => {
      element.querySelector('[role="dialog"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    // A press inside the panel itself is not a backdrop press.
    await act(async () => {
      element.querySelector('h3')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    await act(async () => { root?.unmount() })
    root = undefined
    container?.remove()
    container = undefined
    const busyElement = await mount({ onClose, busy: true })
    await act(async () => {
      busyElement.querySelector('[role="dialog"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
