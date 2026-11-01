/**
 * Project the sibling `sdkwork-models` catalog into `llm-pi-ai`'s relay seed
 * module.
 *
 * The relay routes this build ships (`sdkwork` and `birdcoder`) advertise a
 * model catalog before any configuration exists, so the seed decides what the
 * model picker offers a user who has not fetched an endpoint's own listing.
 * That seed is projected from the catalog rather than hand-kept: every current
 * chat model of every vendor — rows the catalog deprecates, retires, or hides
 * are excluded, and so is a row the catalog replaced with another offered row —
 * in the catalog's own mainstream order (vendor `sortOrder`, then lifecycle,
 * then `rankScore`), with the DeepSeek block hoisted to the top because
 * BirdCoder's picker keeps DeepSeek first.
 *
 *   node scripts/generate-sdkwork-relay-models.mjs
 *   node scripts/generate-sdkwork-relay-models.mjs --check   # fail when stale
 *
 * Regenerate after a catalog bump. The sibling checkout is resolved from this
 * repository's parent directory (the `sdkwork-space` workspace layout) and can
 * be overridden with `SDKWORK_MODELS_ROOT`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelsRoot = process.env.SDKWORK_MODELS_ROOT
  ?? resolve(repositoryRoot, '..', 'sdkwork-models', 'models')
const outputFile = join(repositoryRoot, 'packages', 'llm', 'llm-pi-ai', 'src', 'relay-models.generated.ts')

/** Vendor whose block leads the relay catalog in the picker. */
const LEADING_VENDOR = 'deepseek'

/** Modalities pi-ai models can accept; every other catalog modality is dropped. */
const INPUT_MODALITIES = new Set(['text', 'image'])

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function compareText(left, right) {
  const normalizedLeft = left.toLowerCase()
  const normalizedRight = right.toLowerCase()
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0
}

function lifecycleOrder(value) {
  return value === 'active' ? 0 : value === 'preview' ? 1 : 2
}

/** The catalog entry to read for one vendor: the global region wins over a regional one. */
function preferredVendorEntries(index) {
  const byCode = new Map()
  for (const entry of index.vendors) {
    const current = byCode.get(entry.vendorCode)
    if (current === undefined || entry.regionCode === 'global') byCode.set(entry.vendorCode, entry)
  }
  return byCode
}

/**
 * Whether the catalog itself calls one row current: offered in that region and
 * neither deprecated nor retired. A row missing either status field is not
 * treated as current, so an older catalog schema cannot leak a legacy model
 * into the picker.
 * @param {object} model - one catalog model row.
 * @returns {boolean} whether the row is current.
 */
function isCurrentOffer(model) {
  return model.shelfState === 'listed'
    && model.routingState === 'enabled'
    && ['active', 'preview'].includes(model.lifecycle)
    && ['active', 'preview'].includes(model.releaseStage)
}

/**
 * The catalog key a row's `replacementModel` names. The field is a vendor-local
 * model id, so it is qualified with the row's vendor unless it already carries
 * a vendor prefix.
 * @param {object} model - one catalog model row.
 * @returns {string | undefined} the replacement's catalog key.
 */
function replacementKey(model) {
  const target = model.replacementModel
  if (!target) return undefined
  return target.includes('/') ? target : `${model.vendorCode}/${target}`
}

/**
 * Hide a model the catalog has replaced, when the model it names as its
 * successor is itself offered. The picker then shows the head of each
 * replacement chain instead of every legacy member of it. A model whose named
 * successor is not offered stays, so nothing disappears without a visible
 * replacement, and a cycle in the catalog's links cannot loop.
 * @param {Map<string, object>} rowsByKey - every chat row by catalog key.
 * @param {object[]} models - rows the catalog calls current, in mainstream order.
 * @returns {object[]} the rows to show: current and not superseded by another shown row.
 */
function hideSuperseded(rowsByKey, models) {
  const offered = new Map(models.map(row => [row.model.catalogKey, row.model]))
  const superseded = new Set()
  for (const [key, model] of offered) {
    const seen = new Set([key])
    let nextKey = replacementKey(model)
    while (nextKey !== undefined && !seen.has(nextKey)) {
      if (offered.has(nextKey)) {
        superseded.add(key)
        break
      }
      seen.add(nextKey)
      const next = rowsByKey.get(nextKey)
      nextKey = next === undefined ? undefined : replacementKey(next)
    }
  }
  return models.filter(row => !superseded.has(row.model.catalogKey))
}

/**
 * One authoritative row per chat model, keyed by catalog key. Every region's
 * model files contribute, because a vendor may publish a model in only one
 * region; the vendor's preferred region (the global region when it has one)
 * decides a key's status. A model the preferred region retires is therefore
 * not offered even when a regional catalog still lists it as active, while a
 * model that exists only in a regional catalog keeps that region's row. Only
 * rows the catalog calls current survive, and a row the catalog replaced with
 * another offered row is left out. The vendor metadata (display name, ordering)
 * comes from the preferred entry.
 * @param {{ catalog: object, vendorEntries: Map<string, object> }} input - catalog index and vendor regions.
 * @returns {{ models: object[], excluded: Record<string, number> }} current chat models in mainstream order, plus why other rows were dropped.
 */
function collectModels({ catalog, vendorEntries }) {
  const rowsByKey = new Map()
  const vendors = new Map()
  for (const [vendorCode, entry] of vendorEntries) {
    const vendorPath = join(modelsRoot, entry.path)
    if (existsSync(vendorPath)) vendors.set(vendorCode, readJson(vendorPath))
  }
  for (const entry of catalog.vendors) {
    const preferred = vendorEntries.get(entry.vendorCode) === entry
    for (const file of entry.modelFiles) {
      const modelPath = join(modelsRoot, file)
      if (!existsSync(modelPath)) continue
      const model = readJson(modelPath)
      if (model.primaryCapability !== 'chat') continue
      const current = rowsByKey.get(model.catalogKey)
      if (current === undefined || preferred) rowsByKey.set(model.catalogKey, model)
    }
  }
  const excluded = { deprecated: 0, retired: 0, hidden: 0, disabled: 0, superseded: 0, other: 0 }
  const currentRows = []
  for (const model of rowsByKey.values()) {
    if (isCurrentOffer(model)) {
      currentRows.push({ model, vendor: vendors.get(model.vendorCode) })
      continue
    }
    if (model.lifecycle === 'retired' || model.releaseStage === 'retired') {
      excluded.retired += 1
    } else if (model.lifecycle === 'deprecated' || model.releaseStage === 'deprecated') {
      excluded.deprecated += 1
    } else if (model.shelfState !== 'listed') {
      excluded.hidden += 1
    } else if (model.routingState !== 'enabled') {
      excluded.disabled += 1
    } else {
      excluded.other += 1
    }
  }
  const models = hideSuperseded(rowsByKey, currentRows)
  excluded.superseded = currentRows.length - models.length
  models.sort((left, right) => (
    (left.vendor?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.vendor?.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || lifecycleOrder(left.model.lifecycle) - lifecycleOrder(right.model.lifecycle)
    || Number(right.model.rankScore ?? 0) - Number(left.model.rankScore ?? 0)
    || compareText(left.model.modelId, right.model.modelId)
  ))
  return { models, excluded }
}

/**
 * Reject a projection that would show a model twice, show a model beside the
 * successor the catalog names for it, split a vendor across the list, or lead
 * with a vendor other than the DeepSeek block.
 * @param {object[]} rows - projected rows in picker order.
 */
function assertProjection(rows) {
  const keys = new Set()
  const vendors = new Set()
  let previousVendor
  for (const { model } of rows) {
    if (keys.has(model.catalogKey)) {
      throw new Error(`duplicate catalog key in the relay projection: ${model.catalogKey} (is a vendor published in two regions?)`)
    }
    keys.add(model.catalogKey)
    if (model.vendorCode !== previousVendor) {
      if (vendors.has(model.vendorCode)) {
        throw new Error(`vendor "${model.vendorCode}" is not a contiguous block; the picker would interleave providers`)
      }
      vendors.add(model.vendorCode)
      previousVendor = model.vendorCode
    }
  }
  for (const { model } of rows) {
    const target = replacementKey(model)
    if (target !== undefined && keys.has(target)) {
      throw new Error(`"${model.catalogKey}" names "${target}" as its replacement, but the projection would show both`)
    }
  }
  if (rows[0]?.model.vendorCode !== LEADING_VENDOR) {
    throw new Error(`the relay projection must lead with "${LEADING_VENDOR}", not "${rows[0]?.model.vendorCode ?? 'nothing'}"`)
  }
}

/**
 * Lead with the one vendor the product keeps on top, keeping every other
 * vendor's catalog order.
 * @param {object[]} rows - catalog rows in mainstream order.
 * @returns {object[]} rows with the leading vendor's block first.
 */
function hoistLeadingVendor(rows) {
  const leading = rows.filter(row => row.model.vendorCode === LEADING_VENDOR)
  if (leading.length === 0) return rows
  return [...leading, ...rows.filter(row => row.model.vendorCode !== LEADING_VENDOR)]
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

function renderModel(row) {
  const { model, vendor } = row
  const input = (model.inputModalities ?? []).filter(modality => INPUT_MODALITIES.has(modality))
  return [
    '  {',
    `    catalogKey: ${js(model.catalogKey)},`,
    `    modelId: ${js(model.modelId)},`,
    `    displayName: ${js(model.displayName)},`,
    `    vendorCode: ${js(model.vendorCode)},`,
    `    vendorName: ${js(vendor?.displayName ?? model.vendorName ?? model.vendorCode)},`,
    `    contextWindow: ${Number(model.contextTokens ?? 0)},`,
    `    maxTokens: ${Number(model.maxOutputTokens ?? 0)},`,
    `    input: [${input.map(js).join(', ')}],`,
    '  },',
  ].join('\n')
}

function render(rows, catalog) {
  return `/**
 * Generated relay seed catalog for the harness-shipped relay routes
 * (\`sdkwork\`, \`birdcoder\`): every current chat model the SDKWork models
 * catalog offers — no deprecated, retired, hidden, or already-replaced row — in
 * the catalog's own mainstream order, with the DeepSeek block leading.
 *
 * Source: sdkwork-models catalog ${catalog.catalogVersion} (generatedAt ${catalog.generatedAt}).
 * Regenerate with \`node scripts/generate-sdkwork-relay-models.mjs\`; do not edit by hand.
 */

/** One catalog model the relay routes seed, in picker order. */
export interface SdkworkRelayModelPreset {
  /** Catalog key (\`<vendor>/<modelId>\`); also the relay's wire model id. */
  readonly catalogKey: string
  /** Vendor-local model id. */
  readonly modelId: string
  /** Model name as the catalog spells it, without the vendor prefix. */
  readonly displayName: string
  /** Owning sdkwork-models vendor code. */
  readonly vendorCode: string
  /** Vendor name as the catalog spells it. */
  readonly vendorName: string
  /** Context window in tokens; \`0\` when the catalog states none. */
  readonly contextWindow: number
  /** Maximum output tokens; \`0\` when the catalog states none. */
  readonly maxTokens: number
  /** Accepted input modalities. */
  readonly input: readonly ('text' | 'image')[]
}

/** Catalog version the seed was projected from. */
export const RELAY_MODEL_CATALOG_VERSION = ${js(catalog.catalogVersion)}

/** Relay seed models in picker order: the DeepSeek block first, then the catalog's own order. */
export const RELAY_MODEL_PRESETS: readonly SdkworkRelayModelPreset[] = [
${rows.map(renderModel).join('\n')}
]
`
}

const catalog = readJson(join(modelsRoot, 'index.json'))
const vendorEntries = preferredVendorEntries(catalog)
const { models, excluded } = collectModels({ catalog, vendorEntries })
if (models.length === 0) {
  throw new Error(`no current chat models under ${modelsRoot}; is the catalog checkout present?`)
}
const rows = hoistLeadingVendor(models)
assertProjection(rows)
const rendered = render(rows, catalog)
const checkOnly = process.argv.includes('--check')
if (checkOnly) {
  // `--check` is the regression gate for a catalog bump that was not followed by
  // a regeneration: the committed seed must equal what the catalog projects today.
  const committed = existsSync(outputFile) ? readFileSync(outputFile, 'utf8').replaceAll('\r\n', '\n') : ''
  if (committed !== rendered) {
    console.error(
      `sdkwork relay models are stale against catalog ${catalog.catalogVersion};`
      + ' run `node scripts/generate-sdkwork-relay-models.mjs` and review the diff',
    )
    process.exitCode = 1
  } else {
    console.log(`sdkwork relay models match catalog ${catalog.catalogVersion} (${rows.length} current models)`)
  }
} else {
  writeFileSync(outputFile, rendered)
}
const vendors = new Set(rows.map(row => row.model.vendorCode))
const skipped = Object.entries(excluded)
  .filter(([, count]) => count > 0)
  .map(([reason, count]) => `${count} ${reason}`)
  .join(', ')
console.log(
  `sdkwork relay models from catalog ${catalog.catalogVersion}:`
  + ` ${rows.length} current models across ${vendors.size} vendors`
  + ` (excluded ${skipped || 'none'})`
  + (checkOnly ? '' : ` -> ${outputFile.slice(repositoryRoot.length + 1)}`),
)
console.log(`  leading block: ${rows.filter(row => row.model.vendorCode === LEADING_VENDOR).map(row => row.model.catalogKey).join(', ')}`)
