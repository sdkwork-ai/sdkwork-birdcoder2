// @vitest-environment jsdom
/** The install dialog is its own surface: title, sign-in gate, and no publish chrome. */
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DeployHost, DeployHostClients } from '../src/client/deployHost.ts'
import { TemplateInstallDialog } from '../src/client/TemplateInstallDialog.tsx'
import { zh } from '../src/client/locales.ts'

const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

function translate(key: keyof typeof zh, params?: Record<string, string>): string {
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

describe('TemplateInstallDialog', () => {
  it('renders an install-only dialog and gates it behind sign-in', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(TemplateInstallDialog, {
        host: {} as DeployHost,
        clients: {} as DeployHostClients,
        theme: 'dark',
        t: translate,
        directory: '/proj',
        onClose: () => {},
      }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('从模板安装')
    expect(container.textContent).toContain('登录后管理应用模板')
    expect(container.textContent).not.toContain('发布为模板')
    expect(container.textContent).not.toContain('选择要发布的应用')
  }, 30000)
})
