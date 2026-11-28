/** Initial module manifests; owned Client libraries are compiled before shell assembly. */
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as Zod from 'zod'
import * as ReactVirtual from '@tanstack/react-virtual'
import * as ClientStore from '@deepseek-ai/dsh-client-store'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as UiRenderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import * as UiDockkit from '@deepseek-ai/dsh-client-ui-dockkit'
import * as SdkworkGlobalTokenManager from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import * as SdkworkIcons from '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/sdkwork-icons'
import * as SdkworkRailTooltip from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type { DshClientModuleManifest } from '@deepseek-ai/dsh-package-manifest'
import { STATIC_MODULE_MANIFEST_EXPORT, type PlatformModule } from './platform.ts'

/** Read the manifest a `staticLinked` library exports beside its ordinary exports. */
function compiledModule(id: string, namespace: object): DshClientModuleManifest {
  const manifest: unknown = Reflect.get(namespace, STATIC_MODULE_MANIFEST_EXPORT)
  if (typeof manifest !== 'object' || manifest === null
    || !('id' in manifest) || manifest.id !== id
    || !('factory' in manifest) || typeof manifest.factory !== 'function'
    || ('meta' in manifest && manifest.meta !== undefined && typeof manifest.meta !== 'function')) {
    throw new Error(`web boot: ${id} must be built with staticLinked before shell assembly`)
  }
  return manifest as DshClientModuleManifest
}

function platform(id: string, exports: Record<string, unknown>): DshClientModuleManifest {
  return { id, factory: () => exports }
}

/**
 * Supply shared third-party identities and package-generated manifests through one protocol.
 * @returns Initial module registrations; JavaScript and metadata factories are not evaluated here.
 */
export function getStaticModules(): readonly DshClientModuleManifest[] {
  // The satisfies pin is the projection contract: a word added to
  // PLATFORM_MODULES without a static import here (or vice versa) fails to
  // compile instead of drifting into a runtime require miss.
  return Object.values({
    'react': platform('react', React),
    'react/jsx-runtime': platform('react/jsx-runtime', ReactJsxRuntime),
    'react-dom': platform('react-dom', ReactDom),
    'react-dom/client': platform('react-dom/client', ReactDomClient),
    '@deepseek-ai/cordis': platform('@deepseek-ai/cordis', Cordis),
    'zod': platform('zod', Zod),
    '@tanstack/react-virtual': platform('@tanstack/react-virtual', ReactVirtual),
    '@deepseek-ai/dsh-client-store': compiledModule('@deepseek-ai/dsh-client-store', ClientStore),
    // FORK DIVERGENCE: the web shell aliases these packages to their TypeScript
    // sources (apps/web/vite-source-aliases.ts), so no staticLinked manifest
    // exists in the browser graph; seed the evaluated namespaces instead.
    '@deepseek-ai/dsh-client-ui-slots': platform('@deepseek-ai/dsh-client-ui-slots', UiSlots),
    '@deepseek-ai/dsh-client-ui-primitives': platform('@deepseek-ai/dsh-client-ui-primitives', UiPrimitives),
    '@deepseek-ai/dsh-client-ui-renderer/client': platform('@deepseek-ai/dsh-client-ui-renderer/client', UiRenderer),
    '@deepseek-ai/dsh-client-ui-dockkit': compiledModule('@deepseek-ai/dsh-client-ui-dockkit', UiDockkit),
    '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager':
      platform('@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager', SdkworkGlobalTokenManager),
    '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/sdkwork-icons':
      platform('@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/sdkwork-icons', SdkworkIcons),
    '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip':
      platform('@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip', SdkworkRailTooltip),
  } satisfies Record<PlatformModule, DshClientModuleManifest>)
}
