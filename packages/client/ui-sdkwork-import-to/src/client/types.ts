/**
 * Vocabulary of the relay API-key "导入到" flow.
 *
 * The sixteen targets and their live-config projections mirror CC Switch's
 * provider activation ("点击使用"): the same target ids (`AppType::as_str`),
 * the same files, and the same field names. CC Switch is a Tauri desktop app
 * that writes those files itself; this plugin runs in the BirdCoder browser
 * surface, so it produces the exact projection plus the commands that apply
 * it, and it can hand the same import to CC Switch through its `v1/import`
 * deep link with `enabled=true`.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */

/** CC Switch application ids this plugin can import into (its `AppType` strings). */
export type ImportTargetId =
  | 'claude'
  | 'claude-desktop'
  | 'codex'
  | 'gemini'
  | 'grokbuild'
  | 'opencode'
  | 'openclaw'
  | 'hermes'
  | 'pi'
  | 'mcode'
  | 'kimi'
  | 'dsh'
  | 'agy'
  | 'omp'
  | 'copilot'
  | 'workbuddy'

/** Wire protocol a target accepts; CC Switch's `apiFormat` vocabulary. */
export type ApiFormat = 'anthropic' | 'openai_chat' | 'openai_responses' | 'gemini_native'

/** Host platform the paths and install command are generated for. */
export type TargetPlatform = 'win32' | 'darwin' | 'linux'

/** Symbolic path roots for one platform; never real user paths, so plans are deterministic. */
export interface PlatformPaths {
  readonly platform: TargetPlatform
  /** `%USERPROFILE%` on Windows, `~` elsewhere. */
  readonly home: string
  /** Claude Desktop's roaming base: `%LOCALAPPDATA%`, `~/Library/Application Support`, `~/.local/share`. */
  readonly localAppData: string
  /** OpenCode's base: `%APPDATA%`, `~/Library/Application Support`, `~/.config`. */
  readonly config: string
}

/** Gateway endpoints the relay console resolved for this key. */
export interface GatewayEndpoints {
  readonly anthropicBaseUrl: string
  readonly openAiBaseUrl: string
  readonly geminiBaseUrl: string
}

/** One provider import: the key, its display name, the optional model, and the relay endpoints. */
export interface ImportInput {
  /** Provider display name (CC Switch writes it into `name` / `displayName` fields). */
  readonly name: string
  /** Raw API key value. */
  readonly apiKey: string
  /** Stable provider id; defaults to {@link providerIdFor}. */
  readonly providerId?: string
  /** Model id when the target accepts or requires one. */
  readonly model?: string
  readonly apiFormat: ApiFormat
  readonly endpoints: GatewayEndpoints
  readonly platform: PlatformPaths
  /** Relay homepage the console shows on its key row; the provider link carries it when present. */
  readonly homepage?: string
}

/** How an existing live file receives this plan. */
export type ImportWriteMode =
  /** The tool reads one provider slot; CC Switch replaces the listed keys. */
  | 'merge-json'
  /** TOML tables and keys are replaced, sibling tables stay. */
  | 'merge-toml'
  /** YAML mapping/sequence entries are upserted by name or id. */
  | 'merge-yaml'
  /** The whole file is the provider's own document. */
  | 'replace'
  /** Managed `KEY=VALUE` lines are upserted into a dotenv file. */
  | 'merge-dotenv'

/** One file a click-import produces. */
export interface ImportFile {
  /** Symbolic path (`~`, `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%`). */
  readonly path: string
  readonly format: 'json' | 'jsonc' | 'toml' | 'yaml' | 'dotenv' | 'powershell' | 'shell'
  readonly write: ImportWriteMode
  /** Complete file content for a first-time install. */
  readonly content: string
  /** The part merged into an existing file (absent when {@link write} is `replace`). */
  readonly fragment?: string
  /** Human-readable keys/tables this import owns in the existing file. */
  readonly managedKeys: readonly string[]
  /** Per-file caveat shown in the dialog. */
  readonly note?: string
  /** Plans may mark the file as a backup target instead of a live config (credentials stores). */
  readonly role?: 'live' | 'credentials' | 'support'
}

/** One target's complete click-import projection. */
export interface ImportPlan {
  readonly target: TargetDescriptor
  readonly providerId: string
  readonly apiFormat: ApiFormat
  readonly endpoint: string
  readonly files: readonly ImportFile[]
  /** `ccswitch://v1/import?...&enabled=true`, or `null` when CC Switch has no importer for this target. */
  readonly deeplink: string | null
  /** The command that reproduces the writes on {@link ImportInput.platform}. */
  readonly script: InstallScript
  /** Restart/new-terminal guidance and other caveats. */
  readonly notes: readonly string[]
  /** A command the user runs instead of writing files (Antigravity's private-dir CLI). */
  readonly launchCommand?: string
}

/** Install command for the plan's platform. */
export interface InstallScript {
  readonly kind: 'powershell' | 'posix'
  readonly text: string
}

/** One row of the "导入到" hover menu. */
export interface ImportTargetDescriptorView {
  readonly id: ImportTargetId
  readonly label: string
  /** Two-letter mark rendered in a coloured tile; the catalog carries no brand artwork. */
  readonly badge: { readonly initials: string; readonly color: string }
}

/** Static description of one target. */
export interface TargetDescriptor {
  readonly id: ImportTargetId
  readonly label: string
  readonly badge: { readonly initials: string; readonly color: string }
  /** Protocol formats CC Switch accepts for this target, in menu order. */
  readonly apiFormats: readonly ApiFormat[]
  readonly defaultApiFormat: ApiFormat
  /** CC Switch rejects a link without a model for these targets (`required_link_model`). */
  readonly requiresModel: boolean
  /** Which restart guidance the dialog shows once the files land. */
  readonly restart: 'terminal' | 'app' | 'none'
}
