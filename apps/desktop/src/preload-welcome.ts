import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type WelcomeApi, type WelcomeNotice, type WelcomeSaveResult } from './welcome-api.ts'
import { welcomeFooterLinks, welcomeLinkDestinations, type WelcomeLinkDestinations } from './welcome-links.ts'

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
const brandPrefix = '--dsh-welcome-brand='
const brand = process.argv.find(argument => argument.startsWith(brandPrefix))?.slice(brandPrefix.length)
const linksPrefix = '--dsh-welcome-links='
const linksArgument = process.argv.find(argument => argument.startsWith(linksPrefix))

/**
 * Read the deployment's footer destinations from the window's arguments.
 *
 * The main process resolves them from the brand manifest and sends them here
 * because a sandboxed preload cannot read that file; without the argument the
 * launched brand ships the product's own pages.
 * @param argument - the encoded argument, or undefined when the launch uses them.
 * @returns destinations this window renders and the main process admits.
 */
function footerDestinations(argument: string | undefined): WelcomeLinkDestinations {
  if (argument === undefined) return welcomeLinkDestinations(undefined)
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(argument.slice(linksPrefix.length)))
    return welcomeLinkDestinations(typeof parsed === 'object' && parsed !== null ? { links: parsed } : undefined)
  } catch {
    // A malformed argument must not widen or empty the footer: the shipped
    // pages stay the safe answer, and the main process admits the same set.
    return welcomeLinkDestinations(undefined)
  }
}

const iamSignIn = process.argv.includes('--dsh-welcome-iam-signin=1')
const showApiKeyEntry = process.argv.includes('--dsh-welcome-api-key=1')
const canContinue = process.argv.includes('--dsh-welcome-continue=1')
const resolved = resolveDesktopLocale(locale, brand)
const api: WelcomeApi = {
  ...resolved,
  showApiKeyEntry,
  canContinue,
  footerLinks: welcomeFooterLinks(resolved.messages, resolved.id, footerDestinations(linksArgument)),
  openExternal: href => ipcRenderer.invoke(WELCOME_IPC.openExternal, href) as Promise<void>,
  ...(iamSignIn ? {
    iamSignIn: () => ipcRenderer.invoke(WELCOME_IPC.iamSignIn) as Promise<void>,
  } : {}),
  analytics: async (eventName, attributes) => {
    if (await api.analyticsEnabled()) await ipcRenderer.invoke(WELCOME_IPC.analytics, eventName, attributes)
  },
  analyticsEnabled: () => ipcRenderer.invoke(WELCOME_IPC.analyticsEnabled) as Promise<boolean>,
  takeNotice: () => ipcRenderer.invoke(WELCOME_IPC.takeNotice) as Promise<WelcomeNotice | undefined>,
  startSignIn: () => ipcRenderer.invoke(WELCOME_IPC.start) as Promise<AccountView>,
  cancelSignIn: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.cancel, id) as Promise<AccountView>,
  copySignInLink: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.copyLink, id) as Promise<void>,
  onAccountState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: AccountView): void =>{  listener(state) }
    ipcRenderer.on(WELCOME_IPC.state, receive)
    return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive) }
  },
  saveApiKey: (value: string) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value) as Promise<WelcomeSaveResult>,
  skip: () => ipcRenderer.invoke(WELCOME_IPC.skip) as Promise<void>,
}
contextBridge.exposeInMainWorld('dshWelcome', api)
