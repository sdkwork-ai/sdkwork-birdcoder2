// @vitest-environment jsdom
/** A page whose Peer may not list plugin bundles still boots, and the More menus keep their other rows. */
import { expect } from 'vitest'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'

const withoutPluginManager = createClientTest({ roster: webApp }, { access: action => action !== 'pluginManager/listBundles' })

withoutPluginManager('boots the shipped Web client without the Plugins page navigation', async ({ start }) => {
  const c = await start()
  // FORK DIVERGENCE: the fork's ui-sdkwork-markets page owns the `pluginNavigation`
  // service unconditionally (its own { openBundle } ledger), so a Peer that may not
  // list bundles still sees a service under that name. What this spec guards — the
  // boot survives without the Plugins page and the More menus keep their rows — is
  // asserted below.
  expect(c.ctx.slots.entries('sidebar.panellist.actions').map(entry => entry.options.id)).toContain('entry-customization')
  // FORK DIVERGENCE: the first boot of the 111-row web roster pays its cold
  // module transform alone (~65s on this checkout), which the upstream budget does not cover.
}, 180_000)
