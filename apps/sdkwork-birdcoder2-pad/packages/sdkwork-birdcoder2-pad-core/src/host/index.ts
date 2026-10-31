/**
 * Typed tablet host boundary (APP_PAD_ARCHITECTURE_SPEC.md section 5.10).
 *
 * Feature code routes every tablet capability through this contract. No feature
 * package may branch on a platform global directly.
 */
export const TABLET_HOST_CAPABILITIES = [
  'multitasking',
  'externalDisplay',
  'windowControls',
  'keyboardShortcuts',
  'stylus',
  'filePicker',
  'shareSheet',
  'camera',
  'qrScanner',
  'secureStorage',
  'pushNotifications',
  'biometric',
  'networkStatus',
  'appLifecycle',
  'clipboard',
  'deepLinks',
] as const

export type TabletHostCapability = (typeof TABLET_HOST_CAPABILITIES)[number]

export type TabletHostStatus = 'supported' | 'unsupported' | 'unavailable'

export interface TabletHostOutcome<T = undefined> {
  readonly status: TabletHostStatus
  readonly capability: TabletHostCapability
  readonly value?: T
  readonly reason?: string
}

export interface SecureStoragePort {
  getItem(key: string): Promise<TabletHostOutcome<string | null>>
  setItem(key: string, value: string): Promise<TabletHostOutcome<void>>
  removeItem(key: string): Promise<TabletHostOutcome<void>>
}

export interface TabletHostAdapter {
  readonly platform: 'ipados' | 'android-tablet'
  readonly capabilities: ReadonlySet<TabletHostCapability>
  supports(capability: TabletHostCapability): boolean
  invoke<T = undefined>(
    capability: TabletHostCapability,
    action: string,
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<TabletHostOutcome<T>>
  readonly secureStorage: SecureStoragePort
}

export function supported<T>(capability: TabletHostCapability, value?: T): TabletHostOutcome<T> {
  return value === undefined
    ? { status: 'supported', capability }
    : { status: 'supported', capability, value }
}

export function unsupported<T = undefined>(capability: TabletHostCapability): TabletHostOutcome<T> {
  return { status: 'unsupported', capability }
}

export function unavailable<T = undefined>(
  capability: TabletHostCapability,
  reason: string,
): TabletHostOutcome<T> {
  return { status: 'unavailable', capability, reason }
}
