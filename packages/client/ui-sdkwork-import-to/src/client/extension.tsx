/**
 * The registration seam the CloudRouter console reads.
 *
 * The console and this plugin are separate client bundles, so their module
 * state is not shared; the extension lives on `globalThis` under a namespaced
 * symbol and the console falls back to its built-in three-row menu when none
 * is registered.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { createElement, type ReactNode } from 'react'
import { TargetBadge } from './badge.tsx'
import { openImportToDialog } from './dialog/overlay.ts'
import { TARGETS } from './targets.ts'

/** One row of the console's hover menu. */
export interface QuickImportExtensionTarget {
  readonly id: string
  readonly label: string
  readonly icon?: ReactNode
}

/** The key being imported, as the console knows it. */
export interface QuickImportExtensionKey {
  readonly id: string
  readonly displayName: string
  readonly maskedKey: string
  readonly rawKey: string
}

/** Relay gateway endpoints for the key's workspace. */
export interface QuickImportEndpoints {
  readonly anthropicBaseUrl: string
  readonly openAiBaseUrl: string
  readonly geminiBaseUrl: string
}

/** What the console hands to {@link QuickImportExtension.onSelect}. */
export interface QuickImportExtensionSelection {
  readonly targetId: string
  readonly key: QuickImportExtensionKey
  readonly endpoints: QuickImportEndpoints
  readonly homepage?: string
}

/** The extension object the console reads. */
export interface QuickImportExtension {
  readonly targets: readonly QuickImportExtensionTarget[]
  readonly onSelect: (selection: QuickImportExtensionSelection) => void
}

/** `globalThis` slot shared with the console; `Symbol.for` survives bundle copies. */
const REGISTRY_KEY: symbol = Symbol.for('sdkwork.cloudrouter.quick-import-extension')

/**
 * Narrow a registry value to the extension contract.
 * @param value - value read from the registry.
 * @returns whether the value has the extension's two members.
 */
function isQuickImportExtension(value: unknown): value is QuickImportExtension {
  if (typeof value !== 'object' || value === null) return false
  return 'targets' in value && 'onSelect' in value && typeof value.onSelect === 'function'
}

/**
 * The extension currently registered for the console.
 * @returns the extension, or `null` when no bundle registered one.
 */
export function readQuickImportExtension(): QuickImportExtension | null {
  const value: unknown = Reflect.get(globalThis, REGISTRY_KEY)
  return isQuickImportExtension(value) ? value : null
}

/**
 * Register the sixteen-row menu with the console.
 * @param activeLocale - reads the client's active locale when a row is clicked.
 * @returns a disposer that restores the previous registration.
 */
export function installQuickImportExtension(activeLocale?: () => string): () => void {
  const previous: unknown = Reflect.get(globalThis, REGISTRY_KEY)
  const extension: QuickImportExtension = {
    targets: TARGETS.map(target => ({
      id: target.id,
      label: target.label,
      icon: createElement(TargetBadge, { target }),
    })),
    onSelect: (selection) => {
      openImportToDialog(selection, activeLocale?.())
    },
  }
  Reflect.set(globalThis, REGISTRY_KEY, extension)
  return () => {
    if (readQuickImportExtension() === extension) {
      Reflect.set(globalThis, REGISTRY_KEY, previous)
    }
  }
}
