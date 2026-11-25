/**
 * Mounts the import dialog on `document.body`.
 *
 * The console renders its API-key table inside the app shell, so a fixed
 * overlay needs its own portal host to escape any ancestor `overflow` and
 * `transform`. One dialog is open at a time; opening another replaces it.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ImportToDialog } from './ImportToDialog.tsx'
import type { QuickImportExtensionSelection } from '../extension.tsx'

/** Host and root of the open dialog. */
let active: { host: HTMLDivElement; root: Root } | null = null

/**
 * Close the dialog and remove its host.
 */
export function closeImportToDialog(): void {
  if (active === null) return
  active.root.unmount()
  active.host.remove()
  active = null
}

/**
 * Open the dialog for one selection, replacing any open dialog.
 * @param selection - the menu row plus the key and endpoints the console supplied.
 * @param language - the client's active locale id; the browser's language by default.
 */
export function openImportToDialog(selection: QuickImportExtensionSelection, language?: string): void {
  closeImportToDialog()
  const host = document.createElement('div')
  host.setAttribute('data-sdkwork-import-to-host', '')
  document.body.appendChild(host)
  const root = createRoot(host)
  active = { host, root }
  root.render(createElement(ImportToDialog, { selection, language, onClose: closeImportToDialog }))
}
