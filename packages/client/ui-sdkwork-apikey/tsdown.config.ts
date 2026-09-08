import { resolve } from 'node:path'
import { clientBundle } from '../tsdown.client.ts'

/**
 * The api-keys embed must NOT ship the monaco editor core (multi-MB, CSS
 * sheets the client bundle pipeline cannot process, worker entry imports).
 * The client half therefore stubs the two static `?worker` specifiers and
 * externalizes the bare `monaco-editor` dynamic import — its failure is
 * caught by ConfigCodeEditor's degraded read-only <pre> fallback, so the
 * usage-details drawer stays functional without the editor.
 */
const WORKER_STUB = resolve(import.meta.dirname, 'src/client/monacoWorkerStub.ts')
const MONACO_WORKER_SPECIFIERS = [
  'monaco-editor/esm/vs/editor/editor.worker?worker',
  'monaco-editor/esm/vs/language/json/json.worker?worker',
] as const

const factory = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-apikey', ['lib/types/index.js'])
const resolved = typeof factory === 'function' ? (factory as () => unknown)() : factory
const list = Array.isArray(resolved) ? resolved : [resolved]

for (const config of list) {
  if (typeof config !== 'object' || config === null) continue
  const record = config as {
    entry?: unknown
    alias?: Record<string, string>
    deps?: {
      neverBundle?: (specifier: string) => boolean
      alwaysBundle?: (specifier: string) => boolean
    }
  }
  const entry = record.entry
  const entrySpecifier = typeof entry === 'string'
    ? entry
    : entry && typeof entry === 'object'
      ? Object.values(entry as Record<string, unknown>)[0]
      : undefined
  // The monaco guards apply to EVERY face (client bundle and lib/types):
  // the sibling api-keys console source reached the public type surface, so
  // the types build resolves the same `?worker` specifiers (invalid Windows
  // file names) and the same dynamic `monaco-editor` import (whose esm tree
  // drags CSS sheets the pipeline cannot process).
  if (typeof entrySpecifier !== 'string') {
    continue
  }
  record.alias = {
    ...record.alias,
    ...Object.fromEntries(MONACO_WORKER_SPECIFIERS.map(specifier => [specifier, WORKER_STUB])),
  }
  // Alias keys containing '?' are not matched by rolldown's alias resolver
  // (it treats the specifier as a path and rejects the character); an
  // explicit resolveId hook is the reliable interception point.
  record.plugins = [
    {
      name: 'dsh-monaco-worker-stub',
      resolveId(source: string) {
        if ((MONACO_WORKER_SPECIFIERS as readonly string[]).includes(source)) return WORKER_STUB
        return null
      },
    },
    ...(record.plugins ?? []),
  ]
  const deps = record.deps
  if (deps !== undefined) {
    const { neverBundle, alwaysBundle } = deps
    deps.neverBundle = (specifier: string) =>
      specifier === 'monaco-editor' || (typeof neverBundle === 'function' && neverBundle(specifier))
    if (typeof alwaysBundle === 'function') {
      deps.alwaysBundle = (specifier: string) =>
        specifier !== 'monaco-editor' && alwaysBundle(specifier)
    }
  }
}

export default resolved
