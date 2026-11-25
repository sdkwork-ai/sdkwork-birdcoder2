/**
 * One target's complete click-import projection.
 *
 * Each builder mirrors the live files CC Switch writes when its card is
 * activated; `planImport` adds the CC Switch provider link, the install
 * command, and the restart guidance the dialog shows.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { displayPath } from '../platform.ts'
import type {
  ImportFile,
  ImportInput,
  ImportPlan,
  ImportTargetId,
  TargetDescriptor,
} from '../types.ts'
import { targetById } from '../targets.ts'
import { claudeDesktopFiles, claudeFiles } from './builders/claude.ts'
import { codexFiles } from './builders/codex.ts'
import { endpointOf, modelOf, needsModel, providerIdOf } from './builders/common.ts'
import { copilotFiles } from './builders/copilot.ts'
import { dshFiles } from './builders/dsh.ts'
import { agyFiles, agyProfileDir, geminiFiles } from './builders/gemini.ts'
import { grokbuildFiles } from './builders/grokbuild.ts'
import { hermesFiles } from './builders/hermes.ts'
import { kimiFiles } from './builders/kimi.ts'
import { mcodeFiles } from './builders/mcode.ts'
import { openclawFiles } from './builders/openclaw.ts'
import { opencodeFiles } from './builders/opencode.ts'
import { ompFiles, piFiles } from './builders/pi.ts'
import { workbuddyFiles } from './builders/workbuddy.ts'
import { providerDeeplink } from './deeplink.ts'
import { buildInstallScript } from './script.ts'

/** File builders, one per target. */
const BUILDERS: Readonly<Record<ImportTargetId, (input: ImportInput) => readonly ImportFile[]>> = {
  claude: claudeFiles,
  'claude-desktop': claudeDesktopFiles,
  codex: codexFiles,
  gemini: geminiFiles,
  grokbuild: grokbuildFiles,
  opencode: opencodeFiles,
  openclaw: openclawFiles,
  hermes: hermesFiles,
  pi: piFiles,
  mcode: mcodeFiles,
  kimi: kimiFiles,
  dsh: dshFiles,
  agy: agyFiles,
  omp: ompFiles,
  copilot: copilotFiles,
  workbuddy: workbuddyFiles,
}

/** Restart guidance shared by the targets that need one. */
function restartNote(target: TargetDescriptor): readonly string[] {
  switch (target.restart) {
    case 'terminal':
      return ['重开一个终端窗口后生效。']
    case 'app':
      return ['完全退出应用（含托盘）再重新打开后生效。']
    case 'none':
      return []
  }
}

/** Caveats that belong to a target rather than to one of its files. */
const TARGET_NOTES: Partial<Record<ImportTargetId, readonly string[]>> = {
  claude: ['CLAUDE_CONFIG_DIR 环境变量会改写 ~/.claude 的位置。'],
  'claude-desktop': ['Claude Desktop 的网关 profile 也由这里注册，configLibrary/_meta.json 会把 appliedId 指向它。'],
  codex: ['CODEX_HOME 环境变量会改写 ~/.codex 的位置。', 'base_url 一般以 /v1 结尾，中转站给的就是完整地址。'],
  gemini: ['settings.json 只改认证方式与默认模型，MCP 配置不受影响。'],
  grokbuild: ['同一个 config.toml 里别的模型表保留。'],
  opencode: ['已存在 opencode.jsonc 时 OpenCode 优先读它，把同样的 provider 节点写进 jsonc。'],
  openclaw: ['models.mode 保持 merge，已有 provider 不会被替换。'],
  hermes: ['custom_providers 按 name 原位更新，其它条目保留。'],
  pi: ['Pi 的 settings.json 不动：导入后在 Pi 里选一次这个 provider 即可。'],
  mcode: ['defaultModel 由 MiniMax Code 自己管理，导入后选择一次模型。'],
  kimi: ['Kimi 要求每个模型带正数 max_context_size，这里写 131072。'],
  dsh: [
    'home 级 ~/.dsh/cordis.patch.yml 若含带 config 的 llm-pi-ai，会覆盖 profile 里的 provider，先移除它。',
    'profiles/headless 与 profiles/acp 初始化过时，把同一行 llm-pi-ai 写进它们的 patch。',
  ],
  agy: ['Antigravity 只从进程环境读 Key 与地址，导入用私有 --gemini_dir 目录 + 启动命令。'],
  omp: ['已存在 models.yml 与 models.yaml 时，omp 优先读 models.yaml。'],
  copilot: ['providers.json 里保存的是明文 Key，注意文件权限。'],
  workbuddy: ['availableModels 是非空白名单时，还要把该模型 id 追加进去，否则菜单不显示它。'],
}

/**
 * Antigravity's launch command for the plan platform.
 * @param input - import input.
 * @returns the command that starts the CLI in the private profile.
 */
function agyLaunchCommand(input: ImportInput): string {
  const dir = displayPath(agyProfileDir(input), input.platform.platform)
  if (input.platform.platform === 'win32') {
    return [
      `$env:GEMINI_API_KEY='${input.apiKey}';`,
      `$env:GOOGLE_GEMINI_BASE_URL='${endpointOf(input)}';`,
      `agy --gemini_dir="${dir}"`,
    ].join(' ')
  }
  return [
    `GEMINI_API_KEY='${input.apiKey}'`,
    `GOOGLE_GEMINI_BASE_URL='${endpointOf(input)}'`,
    `agy --gemini_dir="${dir}"`,
  ].join(' ')
}

/**
 * Project one import into its live files, provider link, and install command.
 * @param targetId - target application id.
 * @param input - import input.
 * @returns the complete plan.
 * @throws {TypeError} when the target requires a model and none was given, or
 *         when the target has no builder (neither can happen from the menu).
 */
export function planImport(targetId: ImportTargetId, input: ImportInput): ImportPlan {
  const target = targetById(targetId)
  if (needsModel(target, input)) throw new TypeError(`${target.id} requires a model`)
  const files = BUILDERS[targetId](input)
  const endpoint = endpointOf(input)
  const model = modelOf(input)
  const providerId = providerIdOf(input)
  const deeplink = providerDeeplink({
    app: targetId,
    name: input.name,
    endpoint,
    apiKey: input.apiKey,
    model: model === '' ? undefined : model,
    apiFormat: input.apiFormat,
    homepage: input.homepage,
  })
  const launchCommand = targetId === 'agy' ? agyLaunchCommand(input) : undefined
  return {
    target,
    providerId,
    apiFormat: input.apiFormat,
    endpoint,
    files,
    deeplink,
    script: buildInstallScript(target.label, input.platform.platform, files),
    notes: [...restartNote(target), ...(TARGET_NOTES[targetId] ?? [])],
    launchCommand,
  }
}
