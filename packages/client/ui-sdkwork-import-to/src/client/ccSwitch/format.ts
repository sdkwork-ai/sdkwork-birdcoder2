/**
 * Deterministic serializers for the live files the import writes.
 *
 * Every projection is a pure function of the import input, so the same key and
 * model always produce the same bytes; tests pin those bytes against CC
 * Switch's own templates.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */

/**
 * Pretty JSON with a trailing newline (the shape CC Switch's patch serializer
 * writes for a new file).
 * @param value - JSON value.
 * @returns two-space-indented JSON.
 */
export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * TOML basic string with the escapes TOML requires.
 * @param value - raw string.
 * @returns quoted TOML string.
 */
export function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

/**
 * TOML key segment: bare when it is a bare-key word, quoted otherwise.
 * @param key - map key.
 * @returns the key as TOML spells it.
 */
export function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key)
}

/**
 * Dotenv line for one key.
 * @param key - variable name.
 * @param value - raw value.
 * @returns `KEY=value`, with a single pair of quotes when the value would otherwise
 *          lose characters dotenv treats as special.
 */
export function dotenvLine(key: string, value: string): string {
  const raw = value.replace(/[\r\n]+/g, ' ').trim()
  return /[\s#'"]/.test(raw) ? `${key}="${raw.replace(/"/g, '\\"')}"` : `${key}=${raw}`
}

/** Scalar accepted by the YAML writer. */
export type YamlValue = string | number | boolean | null | readonly YamlValue[] | { readonly [key: string]: YamlValue }

const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'])

/**
 * Whether a string needs quoting in a YAML scalar position.
 * @param value - raw string.
 * @returns whether the writer must quote it.
 */
function yamlNeedsQuotes(value: string): boolean {
  if (value === '' || YAML_RESERVED.has(value.toLowerCase())) return true
  if (/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true
  if (/[\s:#]/.test(value)) return true
  if (/^[-+]?(?:\d|\.\d)/.test(value)) return true
  return false
}

/**
 * Quote one YAML scalar when needed.
 * @param value - raw string.
 * @returns the scalar as written.
 */
function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (!yamlNeedsQuotes(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/**
 * YAML mapping key: quoted when the key is not a plain word.
 * @param key - map key.
 * @returns the key as written.
 */
function yamlKey(key: string): string {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key) ? key : `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Block-style YAML. The structures this plugin writes are small mapping trees
 * with scalar leaves and one level of sequence entries, which is all the
 * writer supports; anything else is a programming error.
 * @param value - document root.
 * @returns the YAML text with a trailing newline.
 */
export function yamlText(value: YamlValue): string {
  return `${emitYaml(value, 0).join('\n')}\n`
}

/**
 * Emit one YAML node at the requested indent.
 * @param value - node.
 * @param indent - current indentation in spaces.
 * @returns physical lines without a trailing newline.
 */
function emitYaml(value: YamlValue, indent: number): string[] {
  const pad = ' '.repeat(indent)
  if (isYamlArray(value)) {
    if (value.length === 0) return [`${pad}[]`]
    return value.flatMap((item) => {
      if (isRecord(item) || isYamlArray(item)) {
        const lines = emitYaml(item, indent + 2)
        return [`${pad}- ${lines[0]?.trimStart() ?? ''}`, ...lines.slice(1)]
      }
      return [`${pad}- ${yamlScalar(item)}`]
    })
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return [`${pad}{}`]
    return entries.flatMap(([key, item]) => {
      if (isRecord(item) || isYamlArray(item)) {
        const empty = isYamlArray(item) ? item.length === 0 : Object.keys(item).length === 0
        if (empty) return [`${pad}${yamlKey(key)}: ${isYamlArray(item) ? '[]' : '{}'}`]
        return [`${pad}${yamlKey(key)}:`, ...emitYaml(item, indent + 2)]
      }
      return [`${pad}${yamlKey(key)}: ${yamlScalar(item)}`]
    })
  }
  return [`${pad}${yamlScalar(value)}`]
}

/**
 * Narrow a YAML node to an array. `Array.isArray` alone leaves a
 * `readonly YamlValue[]` union member un-narrowed, so the guard is explicit.
 * @param value - node.
 * @returns whether the node is a sequence.
 */
function isYamlArray(value: YamlValue): value is readonly YamlValue[] {
  return Array.isArray(value)
}

/**
 * Narrow a YAML node to a string-keyed record.
 * @param value - node.
 * @returns whether the node is a mapping.
 */
function isRecord(value: YamlValue): value is { readonly [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Lower-case URL-safe provider id derived from the display name, the same
 * role CC Switch's `{slug}-{n}` id plays. Non-ASCII names fall back to
 * `sdkwork` so every target accepts the value as a key.
 * @param name - provider display name.
 * @returns the provider id.
 */
export function providerIdFor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug === '' ? 'sdkwork' : slug
}

/**
 * Upper-snake form of the provider id, used for env-var references.
 * @param providerId - provider id.
 * @returns a POSIX-style environment variable name.
 */
export function envReferenceFor(providerId: string): string {
  return providerId.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
}

/**
 * Trim a trailing slash from an endpoint.
 * @param endpoint - raw endpoint.
 * @returns the endpoint without a trailing slash.
 */
export function trimEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '')
}
