import type { TabletHostCapability } from '@sdkwork/birdcoder2-pad-core'

/**
 * Capabilities this host actually declares.
 *
 * This set must equal the `capabilities` array in
 * `specs/tablet-adaptation.spec.json`; a capability listed there but absent here
 * is a release blocker (APP_PAD_ARCHITECTURE_SPEC.md section 5.12).
 */
export const TABLET_HOST_CAPABILITIES = [
  'multitasking',
  'windowControls',
  'keyboardShortcuts',
  'filePicker',
  'shareSheet',
  'secureStorage',
  'networkStatus',
  'appLifecycle',
  'clipboard',
  'deepLinks',
] as const satisfies readonly TabletHostCapability[]

export type DeclaredTabletHostCapability = (typeof TABLET_HOST_CAPABILITIES)[number]

export const TABLET_HOST_PLATFORM_TARGETS = ['tablet-ipados', 'tablet-android'] as const
export type TabletHostRuntimeTarget = (typeof TABLET_HOST_PLATFORM_TARGETS)[number]
