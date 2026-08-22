// Packaged-boot smoke probe: boots the host layout of a BUILT desktop app and
// exits 0 on success. Used by the release workflow to verify "install and run
// without extra configuration" on each platform; run against the packaged
// resources/app with a scratch DSH_PROBE_HOME:
//   npx electron scripts/packaged-boot-probe.cjs <app-dir> [--no-sandbox]
//
// The probe covers clean-machine first boot and restart with a plugin installed
// in the shared Web profile. The host tree serves every advertised client
// bundle, creates a session, and persists plugin, model, and credential
// configuration. The second boot verifies that configuration and the profile
// plugin without persisting the desktop transport in the shared manifest.
const { app } = require('electron')
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

// The app dir may arrive relative to the caller's cwd (the workflow runs the
// probe through pnpm --filter, whose exec cwd is the desktop package); the
// file:// import below requires an absolute path.
const appDir = resolve(process.argv[2])
const home = join(process.env.TEMP ?? '/tmp', 'dsh-packaged-boot-probe')
const resultFile = join(home, 'probe-result.txt')

rmSync(home, { recursive: true, force: true })

function valueOf(response) {
  if (response.result?.ok === true) return response.result.value
  throw new Error(response.result?.error?.message ?? 'RPC failed without a diagnostic')
}

app.whenReady().then(async () => {
  const lines = []
  let ok = false
  try {
    const { bootDesktopHost } = await import('file://' + appDir + '/lib/host.js')
    const requiredNamespaces = ['agent-loop', 'llm-deepseek', 'llm-pi-ai', 'shell', 'web-search-deepseek']
    const requiredSettingsClients = [
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu',
      '@deepseek-ai/dsh-client-ui-settings-models',
      '@deepseek-ai/dsh-client-ui-settings-plugin-inventory',
      '@deepseek-ai/dsh-client-ui-settings-plugins',
    ]
    const credentialRef = 'DSH_PACKAGED_CONFIGURATION_PROBE_KEY'
    const credentialValue = 'packaged-configuration-probe-secret'
    const modelBaseURL = 'https://packaged-configuration-probe.invalid/v1'
    const shellTimeoutMs = 23_456
    let hasCarrier = false
    let hasBridge = false
    let servesShell = false
    let servesBundles = false
    let createsSession = false
    let configurationAvailable = false
    let credentialSeparated = false
    let cleanClientIds = []

    const first = await bootDesktopHost({ home, installAnchor: appDir + '/package.json' })
    try {
      // The tree settled; the webServer-shaped carrier and the desktop bridge
      // are the desktop transport's required services.
      const carrier = first.ctx.get('webServer')
      hasCarrier = typeof carrier.dispatch === 'function'
      hasBridge = first.ctx.get('desktopBridge') !== undefined
      lines.push('carrier: ' + String(hasCarrier) + ', bridge: ' + String(hasBridge))

      const index = await carrier.dispatch(new Request('http://dsh.internal/index.html'))
      const indexText = await index.text()
      // The module graph is injected as a global row, rendered as
      // `globalThis["__DSH_BOOT__"] = ...` (packages/host/webserver injections).
      servesShell = index.status === 200 && indexText.includes('globalThis["__DSH_BOOT__"]')
      lines.push('shell: ' + String(servesShell) + ' (status ' + index.status + ')')

      // One resolved bundle cannot prove that electron-builder retained the
      // full client graph, so the probe fetches every advertised entry.
      const graph = first.ctx.get('clientModules').graph()
      cleanClientIds = graph.entries.map(entry => entry.id).sort()
      const bundleResults = await Promise.all(graph.entries.map(async (entry) => {
        const response = await carrier.dispatch(new Request(new URL(entry.url, 'http://dsh.internal')))
        return { id: entry.id, status: response.status }
      }))
      const failedBundles = bundleResults.filter(result => result.status !== 200)
      servesBundles = bundleResults.length > 0 && failedBundles.length === 0
      lines.push('bundles: ' + String(servesBundles) + ' ('
        + String(bundleResults.length - failedBundles.length) + '/' + String(bundleResults.length) + ')'
        + (failedBundles.length === 0 ? '' : ' ' + JSON.stringify(failedBundles)))
      lines.push('client-ids: ' + JSON.stringify(cleanClientIds))

      const apiProxy = first.ctx.get('apiProxy')
      const described = valueOf(await apiProxy.settings.describe({ rpcId: 'probe-settings', payload: {} }))
      const namespaceIds = described.namespaces.map(namespace => namespace.ns)
      const providerIds = valueOf(await apiProxy.llm.providers({ rpcId: 'probe-providers', payload: {} }))
        .providers.map(provider => provider.provider)
      configurationAvailable = requiredNamespaces.every(ns => namespaceIds.includes(ns))
        && requiredSettingsClients.every(id => cleanClientIds.includes(id))
        && ['deepseek-official', 'openai'].every(provider => providerIds.includes(provider))
      lines.push('configuration: ' + String(configurationAvailable)
        + ' (namespaces ' + String(requiredNamespaces.filter(ns => namespaceIds.includes(ns)).length)
        + '/' + String(requiredNamespaces.length)
        + ', settings-clients ' + String(requiredSettingsClients.filter(id => cleanClientIds.includes(id)).length)
        + '/' + String(requiredSettingsClients.length) + ')')

      valueOf(await apiProxy.settings.mutate({
        rpcId: 'probe-shell-settings',
        payload: {
          ns: 'shell',
          ops: [{ op: 'set', path: ['timeoutMs'], value: shellTimeoutMs }],
        },
      }))
      valueOf(await apiProxy.settings.mutate({
        rpcId: 'probe-model-settings',
        payload: {
          ns: 'llm-deepseek',
          ops: [
            { op: 'set', path: ['apiKeyEnv'], value: credentialRef },
            { op: 'set', path: ['baseURL'], value: modelBaseURL },
          ],
        },
      }))
      valueOf(await apiProxy.credentials.set({
        rpcId: 'probe-credential',
        payload: { ref: credentialRef, value: credentialValue },
      }))
      const settingsDocument = readFileSync(join(home, 'settings.yaml'), 'utf8')
      const credentialsDocument = readFileSync(join(home, '.credentials.yaml'), 'utf8')
      credentialSeparated = settingsDocument.includes(credentialRef)
        && !settingsDocument.includes(credentialValue)
        && credentialsDocument.includes(credentialValue)
      lines.push('credential-separated: ' + String(credentialSeparated))

      const created = await apiProxy.sessions.create({ rpcId: 'probe-session', payload: {} })
      createsSession = created.result?.ok === true
      lines.push('session.create: ' + String(createsSession) + (created.result?.ok === true
        ? ' (' + created.result.value.sessionId + ')'
        : ' ' + JSON.stringify(created.result?.error)))
    } finally {
      await first.shutdown.shutdown(0)
    }

    // Existing-machine path: a plugin installed into the canonical Web
    // profile, plus that profile's own patch, must reach Electron unchanged.
    // The desktop transport remains a runtime overlay and must not be written
    // into the shared manifest.
    const profileDir = join(home, 'profiles', 'web')
    const packageName = 'packaged-profile-addon'
    const packageDir = join(profileDir, 'node_modules', packageName)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: packageName,
      version: '0.0.0',
      type: 'module',
      exports: {
        import: './index.js',
        require: './index.cjs',
      },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'index.js'), [
      "export const name = 'packaged-profile-addon'",
      'export function apply(ctx, config) {',
      "  ctx.provide('packagedProfileAddon', config.value)",
      '}',
      '',
    ].join('\n'))
    writeFileSync(join(packageDir, 'index.cjs'), [
      'exports.apply = function apply(ctx) {',
      "  ctx.provide('packagedRequireAddon', true)",
      '}',
      '',
    ].join('\n'))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), [
      '- insert:',
      '    - id: packaged-profile-addon',
      `      name: '${packageName}'`,
      '      config:',
      '        value: bundle-default',
      '',
    ].join('\n'))
    const manifestPath = join(profileDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.dependencies[packageName] = '0.0.0'
    manifest.dsh.profile.bundles.push(packageName)
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    writeFileSync(join(profileDir, 'cordis.patch.yml'), [
      '- id: packaged-profile-addon',
      '  config:',
      '    value: web-profile-patch',
      '',
    ].join('\n'))

    let loadsProfilePlugin = false
    let preservesClientGraph = false
    let sharedProfile = false
    let configurationPersisted = false
    let credentialPersisted = false
    const customized = await bootDesktopHost({ home, installAnchor: appDir + '/package.json' })
    try {
      loadsProfilePlugin = customized.ctx.get('packagedProfileAddon') === 'web-profile-patch'
        && customized.ctx.get('packagedRequireAddon') === undefined
      const customizedClientIds = customized.ctx.get('clientModules').graph().entries.map(entry => entry.id).sort()
      preservesClientGraph = JSON.stringify(customizedClientIds) === JSON.stringify(cleanClientIds)
      const persistedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      sharedProfile = !persistedManifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-sdkwork-desktop-app')

      const apiProxy = customized.ctx.get('apiProxy')
      const described = valueOf(await apiProxy.settings.describe({ rpcId: 'probe-settings-restart', payload: {} }))
      const shell = described.namespaces.find(namespace => namespace.ns === 'shell')
      const deepseek = described.namespaces.find(namespace => namespace.ns === 'llm-deepseek')
      configurationPersisted = shell?.user?.timeoutMs === shellTimeoutMs
        && deepseek?.user?.apiKeyEnv === credentialRef
        && deepseek?.user?.baseURL === modelBaseURL
      const credential = valueOf(await apiProxy.credentials.describe({
        rpcId: 'probe-credential-restart',
        payload: { refs: [credentialRef] },
      })).credentials[credentialRef]
      credentialPersisted = credential?.configured === true
        && credential.source === 'file'
        && credential.writable === true
      lines.push('configuration-persisted: ' + String(configurationPersisted)
        + ', credential-persisted: ' + String(credentialPersisted))
      lines.push('profile-plugin: ' + String(loadsProfilePlugin)
        + ', shared-web-profile: ' + String(sharedProfile))
      lines.push('client-graph-stable: ' + String(preservesClientGraph))
    } finally {
      await customized.shutdown.shutdown(0)
    }
    ok = hasCarrier && hasBridge && servesShell && servesBundles && createsSession
      && configurationAvailable && credentialSeparated && configurationPersisted && credentialPersisted
      && loadsProfilePlugin && sharedProfile && preservesClientGraph
  } catch (cause) {
    lines.push('BOOT FAILED:')
    let node = cause
    while (node) {
      lines.push('- ' + (node instanceof Error ? node.stack ?? node.message : String(node)))
      if (Array.isArray(node.errors)) for (const e of node.errors) lines.push('- ' + (e instanceof Error ? e.message : String(e)))
      node = node.cause
    }
  }
  // Echo the verdict so CI logs carry it even when the result write fails;
  // the exit code is the smoke verdict either way.
  console.log(lines.join('\n'))
  try {
    // The scratch home may not exist when the boot failed before creating it.
    mkdirSync(home, { recursive: true })
    writeFileSync(resultFile, lines.join('\n'))
  } catch (error) {
    // A lost result file costs only the diagnostic text, already echoed above.
    console.error('probe: failed to write result file: ' + String(error))
  } finally {
    app.exit(ok ? 0 : 1)
  }
})
