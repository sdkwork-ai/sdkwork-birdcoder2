/**
 * Project the sibling `sdkwork-models` catalog into the four SDKWork model
 * configuration plugins' preset modules.
 *
 * Each generated module carries the official vendor rows (canonical API base
 * URL and protocol, straight from the catalog's `protocolBaseUrls`) and the
 * catalog's models for that one modality, so the settings pages can seed a
 * provider list from facts the catalog already owns instead of a hand-kept
 * list. Regenerate after a catalog bump:
 *
 *   node scripts/generate-sdkwork-model-presets.mjs
 *
 * The sibling checkout is resolved from this repository's parent directory
 * (the `sdkwork-space` workspace layout) and can be overridden with
 * `SDKWORK_MODELS_ROOT`.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelsRoot = process.env.SDKWORK_MODELS_ROOT
  ?? resolve(repositoryRoot, '..', 'sdkwork-models', 'models')

/** One generated module per modality: capability code, package directory, and export names. */
const MODALITIES = [
  {
    modality: 'image',
    capability: 'image',
    packageDir: 'packages/client/ui-sdkwork-image-models',
    vendorExport: 'OFFICIAL_IMAGE_VENDOR_PRESETS',
    modelExport: 'CATALOG_IMAGE_MODEL_PRESETS',
    vendorType: 'SdkworkImageVendorPreset',
    modelType: 'SdkworkImageModelPreset',
    purpose: 'image generation and editing',
  },
  {
    modality: 'video',
    capability: 'video',
    packageDir: 'packages/client/ui-sdkwork-video-models',
    vendorExport: 'OFFICIAL_VIDEO_VENDOR_PRESETS',
    modelExport: 'CATALOG_VIDEO_MODEL_PRESETS',
    vendorType: 'SdkworkVideoVendorPreset',
    modelType: 'SdkworkVideoModelPreset',
    purpose: 'video generation',
  },
  {
    modality: 'voice',
    capability: 'audio',
    packageDir: 'packages/client/ui-sdkwork-voice-models',
    vendorExport: 'OFFICIAL_VOICE_VENDOR_PRESETS',
    modelExport: 'CATALOG_VOICE_MODEL_PRESETS',
    vendorType: 'SdkworkVoiceVendorPreset',
    modelType: 'SdkworkVoiceModelPreset',
    purpose: 'speech synthesis and transcription',
  },
  {
    modality: 'music',
    capability: 'music',
    packageDir: 'packages/client/ui-sdkwork-music-models',
    vendorExport: 'OFFICIAL_MUSIC_VENDOR_PRESETS',
    modelExport: 'CATALOG_MUSIC_MODEL_PRESETS',
    vendorType: 'SdkworkMusicVendorPreset',
    modelType: 'SdkworkMusicModelPreset',
    purpose: 'music generation',
  },
]

/** Protocol preference when a vendor publishes several: the OpenAI-compatible root is the widest surface. */
const PROTOCOL_PREFERENCE = ['openai_compatible', 'openai_responses', 'anthropic_messages']

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Every vendor directory holding a `<region>/vendor.json`. */
function vendorRegions() {
  const rows = []
  for (const vendor of readdirSync(modelsRoot, { withFileTypes: true })) {
    if (!vendor.isDirectory()) continue
    const vendorRoot = join(modelsRoot, vendor.name)
    for (const region of readdirSync(vendorRoot, { withFileTypes: true })) {
      if (!region.isDirectory()) continue
      const manifest = join(vendorRoot, region.name, 'vendor.json')
      if (!existsSync(manifest)) continue
      rows.push({ vendorRoot, region: region.name, manifest, vendor: readJson(manifest) })
    }
  }
  return rows
}

/** Catalog model files for one vendor region, keyed by modality capability. */
function catalogModels(vendorRoot, region) {
  const modelsDir = join(vendorRoot, region, 'models')
  if (!existsSync(modelsDir)) return []
  const models = []
  for (const file of readdirSync(modelsDir)) {
    if (!file.endsWith('.json')) continue
    models.push(readJson(join(modelsDir, file)))
  }
  return models
}

/** Canonical `https://host/pathPrefix` root for one vendor, empty when the catalog declares none. */
function baseUrlOf(vendor) {
  const published = vendor.protocolBaseUrls ?? {}
  const protocols = Object.keys(published)
  const protocol = PROTOCOL_PREFERENCE.find(candidate => protocols.includes(candidate)) ?? protocols[0]
  if (protocol === undefined) return { protocol: '', baseUrl: '' }
  const endpoint = published[protocol]
  const prefix = (endpoint.pathPrefix ?? '').replace(/\/+$/u, '')
  return { protocol, baseUrl: `https://${endpoint.host}${prefix}` }
}

/**
 * Emit one string literal in the repository's single-quoted style. The JSON
 * form is the escaping source of truth (control characters, backslashes), so
 * only the delimiters change.
 * @param value - catalog text to emit.
 * @returns the TypeScript literal.
 */
function js(value) {
  const json = JSON.stringify(value)
  if (!json.startsWith('"')) return json
  return `'${json.slice(1, -1).replaceAll('\'', '\\\'')}'`
}

function renderVendor(type, row) {
  const lines = [
    '  {',
    `    vendor: ${js(row.vendor)},`,
    `    displayName: ${js(row.displayName)},`,
    `    region: ${js(row.region)},`,
    `    protocol: ${js(row.protocol)},`,
    `    baseUrl: ${js(row.baseUrl)},`,
    `    protocols: [${row.protocols.map(js).join(', ')}],`,
    '  },',
  ]
  return lines.join('\n')
}

function renderModel(row) {
  return [
    '  {',
    `    catalogKey: ${js(row.catalogKey)},`,
    `    modelId: ${js(row.modelId)},`,
    `    displayName: ${js(row.displayName)},`,
    `    vendor: ${js(row.vendor)},`,
    `    region: ${js(row.region)},`,
    `    apiFormat: ${js(row.apiFormat)},`,
    `    lifecycle: ${js(row.lifecycle)},`,
    '  },',
  ].join('\n')
}

function render(modality, vendors, models, catalogVersion, generatedAt) {
  return `/**
 * Generated official-vendor and model presets for the SDKWork ${modality.modality} model
 * configuration page: the catalog's own ${modality.purpose} vendors with their canonical
 * API roots, and every catalog model in that modality.
 *
 * Source: sdkwork-models catalog ${catalogVersion} (generatedAt ${generatedAt}).
 * Regenerate with \`node scripts/generate-sdkwork-model-presets.mjs\`; do not edit by hand.
 */

/** One official vendor root the ${modality.modality} settings page can seed. */
export interface ${modality.vendorType} {
  /** sdkwork-models vendor code. */
  readonly vendor: string
  /** Vendor name as the catalog spells it. */
  readonly displayName: string
  /** Catalog region this root belongs to (\`global\`, \`cn\`). */
  readonly region: string
  /** Preferred protocol code; empty when the catalog publishes no compatible root. */
  readonly protocol: string
  /** Canonical API root; empty when the catalog publishes no compatible root. */
  readonly baseUrl: string
  /** Every protocol code the vendor publishes a root for. */
  readonly protocols: readonly string[]
}

/** One catalog model the ${modality.modality} settings page can offer. */
export interface ${modality.modelType} {
  /** Catalog key (\`<vendor>/<modelId>\`). */
  readonly catalogKey: string
  /** Wire model id the provider expects. */
  readonly modelId: string
  /** Vendor name as the catalog spells it. */
  readonly displayName: string
  /** Owning sdkwork-models vendor code. */
  readonly vendor: string
  /** Catalog region this model belongs to. */
  readonly region: string
  /** Vendor API shape the catalog records for the model. */
  readonly apiFormat: string
  /** Catalog lifecycle stage. */
  readonly lifecycle: string
}

/** Official vendor roots with a ${modality.modality} capability. */
export const ${modality.vendorExport}: readonly ${modality.vendorType}[] = [
${vendors.map(row => renderVendor(modality.vendorType, row)).join('\n')}
]

/** Every catalog model whose primary capability is ${modality.modality}. */
export const ${modality.modelExport}: readonly ${modality.modelType}[] = [
${models.map(renderModel).join('\n')}
]
`
}

const catalog = readJson(join(modelsRoot, 'index.json'))
const regions = vendorRegions()
const written = []

for (const modality of MODALITIES) {
  const vendors = []
  const models = []
  for (const row of regions) {
    const vendorModels = catalogModels(row.vendorRoot, row.region)
      .filter(model => model.primaryCapability === modality.capability)
    if (vendorModels.length === 0) continue
    const root = baseUrlOf(row.vendor)
    vendors.push({
      vendor: row.vendor.vendorCode,
      displayName: row.vendor.displayName,
      region: row.region,
      protocol: root.protocol,
      baseUrl: root.baseUrl,
      protocols: Object.keys(row.vendor.protocolBaseUrls ?? {}),
    })
    for (const model of vendorModels) {
      models.push({
        catalogKey: model.catalogKey,
        modelId: model.modelId,
        displayName: model.displayName,
        vendor: model.vendorCode,
        region: model.regionCode,
        apiFormat: model.apiFormat,
        lifecycle: model.lifecycle,
      })
    }
  }
  vendors.sort((left, right) => left.vendor.localeCompare(right.vendor) || left.region.localeCompare(right.region))
  models.sort((left, right) => left.catalogKey.localeCompare(right.catalogKey))
  const target = join(repositoryRoot, modality.packageDir, 'src', 'model-presets.ts')
  writeFileSync(target, render(modality, vendors, models, catalog.catalogVersion, catalog.generatedAt))
  written.push(`${modality.packageDir}/src/model-presets.ts  ${vendors.length} vendors, ${models.length} models`)
}

console.log(`sdkwork model presets from catalog ${catalog.catalogVersion}:`)
for (const line of written) console.log(`  ${line}`)
