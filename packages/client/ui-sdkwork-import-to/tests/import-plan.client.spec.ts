/**
 * Per-target projections: every one of the sixteen tools produces the live
 * files CC Switch's click-to-use writes, with the format, endpoint, model,
 * and key in the target's own field names.
 */
import { describe, expect, it } from 'vitest'
import { planImport } from '../src/client/ccSwitch/project.ts'
import { platformPaths } from '../src/client/platform.ts'
import type { ApiFormat, ImportInput, ImportTargetId } from '../src/client/types.ts'

const endpoints = {
  anthropicBaseUrl: 'https://relay.example.com/anthropic',
  openAiBaseUrl: 'https://relay.example.com/v1',
  geminiBaseUrl: 'https://relay.example.com/gemini',
}

/** One target's catalog expectations. */
interface Case {
  readonly id: ImportTargetId
  readonly format: ApiFormat
  readonly model?: string
  readonly paths: readonly string[]
  readonly expects: readonly string[]
}

const CASES: readonly Case[] = [
  {
    id: 'claude',
    format: 'anthropic',
    model: 'claude-sonnet-4-5',
    paths: ['%USERPROFILE%\\.claude\\settings.json'],
    expects: ['"ANTHROPIC_BASE_URL": "https://relay.example.com/anthropic"', '"ANTHROPIC_AUTH_TOKEN": "sk-test-123"', '"ANTHROPIC_MODEL": "claude-sonnet-4-5"'],
  },
  {
    id: 'claude-desktop',
    format: 'anthropic',
    model: 'claude-sonnet-4-5',
    paths: [
      '%LOCALAPPDATA%\\Claude\\claude_desktop_config.json',
      '%LOCALAPPDATA%\\Claude-3p\\claude_desktop_config.json',
      '%LOCALAPPDATA%\\Claude-3p\\configLibrary\\00000000-0000-4000-8000-0000000b17c0.json',
      '%LOCALAPPDATA%\\Claude-3p\\configLibrary\\_meta.json',
    ],
    expects: [
      '"deploymentMode": "3p"',
      '"inferenceGatewayApiKey": "sk-test-123"',
      '"inferenceGatewayBaseUrl": "https://relay.example.com/anthropic"',
      '"inferenceModels": [\n    "claude-sonnet-4-5"\n  ]',
      '"appliedId": "00000000-0000-4000-8000-0000000b17c0"',
    ],
  },
  {
    id: 'codex',
    format: 'openai_responses',
    model: 'gpt-5.2',
    paths: ['%USERPROFILE%\\.codex\\config.toml', '%USERPROFILE%\\.codex\\auth.json'],
    expects: [
      'model_provider = "custom"',
      'model = "gpt-5.2"',
      'base_url = "https://relay.example.com/v1"',
      'wire_api = "responses"',
      '"OPENAI_API_KEY": "sk-test-123"',
    ],
  },
  {
    id: 'gemini',
    format: 'gemini_native',
    model: 'gemini-2.5-pro',
    paths: ['%USERPROFILE%\\.gemini\\.env', '%USERPROFILE%\\.gemini\\settings.json'],
    expects: [
      'GOOGLE_GEMINI_BASE_URL=https://relay.example.com/gemini',
      'GEMINI_API_KEY=sk-test-123',
      'GEMINI_MODEL=gemini-2.5-pro',
      '"selectedType": "gemini-api-key"',
      '"name": "gemini-2.5-pro"',
    ],
  },
  {
    id: 'grokbuild',
    format: 'openai_responses',
    paths: ['%USERPROFILE%\\.grok\\config.toml'],
    expects: [
      'default = "grok-4.7"',
      'api_backend = "responses"',
      'context_window = 500000',
      'base_url = "https://relay.example.com/v1"',
    ],
  },
  {
    id: 'opencode',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%APPDATA%\\opencode\\opencode.json'],
    expects: ['"npm": "@ai-sdk/openai-compatible"', '"baseURL": "https://relay.example.com/v1"', '"m1"'],
  },
  {
    id: 'openclaw',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.openclaw\\openclaw.json'],
    expects: ['"mode": "merge"', '"baseUrl": "https://relay.example.com/v1"', '"api": "openai-completions"'],
  },
  {
    id: 'hermes',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%LOCALAPPDATA%\\hermes\\config.yaml'],
    expects: ['custom_providers:', 'api_mode: chat_completions', 'base_url: "https://relay.example.com/v1"', 'provider: cloud-router'],
  },
  {
    id: 'pi',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.pi\\agent\\models.json'],
    expects: ['"name": "Cloud Router"', '"baseUrl": "https://relay.example.com/v1"', '"api": "openai-completions"'],
  },
  {
    id: 'mcode',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.minimax\\config.yaml'],
    expects: ['kind: custom', 'enabled: true', 'baseURL: "https://relay.example.com/v1"', 'api: openai-completions'],
  },
  {
    id: 'kimi',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.kimi-code\\config.toml'],
    expects: [
      'default_model = "cloud-router/m1"',
      '[providers.cloud-router]',
      'type = "openai"',
      '[models."cloud-router/m1"]',
      'max_context_size = 131072',
    ],
  },
  {
    id: 'dsh',
    format: 'openai_chat',
    model: 'qwen3-max',
    paths: [
      '%USERPROFILE%\\.dsh\\profiles\\web\\cordis.patch.yml',
      '%USERPROFILE%\\.dsh\\profiles\\desktop\\cordis.patch.yml',
      '%USERPROFILE%\\.dsh\\.credentials.yaml',
    ],
    expects: ['- id: llm-pi-ai', 'apiKeyEnv: BIRDCODER_DSH_CLOUD_ROUTER', 'api: openai-completions', 'refs:'],
  },
  {
    id: 'agy',
    format: 'gemini_native',
    model: 'gemini-2.5-pro',
    paths: ['%USERPROFILE%\\.birdcoder\\agy\\cloud-router\\antigravity-cli\\settings.json'],
    expects: ['"modelProvider": "gemini"', '"model": "gemini-2.5-pro"'],
  },
  {
    id: 'omp',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.omp\\agent\\models.yml'],
    expects: ['providers:', 'baseUrl: "https://relay.example.com/v1"', 'api: openai-completions'],
  },
  {
    id: 'copilot',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.copilot\\providers.json'],
    expects: ['"providers": [', '"wireApi": "completions"', '"provider": "cloud-router"'],
  },
  {
    id: 'workbuddy',
    format: 'openai_chat',
    model: 'm1',
    paths: ['%USERPROFILE%\\.workbuddy\\models.json'],
    expects: ['"supportsToolCall": true', '"ccSwitchProviderId": "cloud-router"'],
  },
]

function inputFor(item: Case): ImportInput {
  return {
    name: 'Cloud Router',
    apiKey: 'sk-test-123',
    apiFormat: item.format,
    endpoints,
    platform: platformPaths('win32'),
    ...(item.model === undefined ? {} : { model: item.model }),
  }
}

function requiredCase(id: ImportTargetId): Case {
  const found = CASES.find(item => item.id === id)
  if (found === undefined) throw new TypeError(`no expectations for ${id}`)
  return found
}

describe('import plans', () => {
  for (const item of CASES) {
    it(`projects ${item.id} into CC Switch's live files`, () => {
      const plan = planImport(item.id, inputFor(item))
      expect(plan.target.id).toBe(item.id)
      expect(plan.files.map(file => file.path)).toEqual(item.paths)
      const text = plan.files.map(file => file.content).join('\n')
      for (const expected of item.expects) expect(text).toContain(expected)
      expect(plan.deeplink).toContain(`app=${item.id}`)
      expect(plan.deeplink).toContain('resource=provider')
      expect(plan.deeplink).toContain('enabled=true')
      expect(plan.deeplink).toContain(`apiFormat=${item.format}`)
      expect(plan.script.kind).toBe('powershell')
    })
  }

  it('carries the relay homepage into the provider link', () => {
    const plan = planImport('claude', {
      ...inputFor(requiredCase('claude')),
      homepage: 'https://relay.example.com',
    })
    expect(plan.deeplink).toContain('homepage=https%3A%2F%2Frelay.example.com')
  })

  it('trims a trailing slash from the endpoint', () => {
    const plan = planImport('claude', {
      ...inputFor(requiredCase('claude')),
      endpoints: {
        anthropicBaseUrl: 'https://relay.example.com/anthropic/',
        openAiBaseUrl: 'https://relay.example.com/v1/',
        geminiBaseUrl: 'https://relay.example.com/gemini/',
      },
    })
    expect(plan.files[0]?.content).toContain('"ANTHROPIC_BASE_URL": "https://relay.example.com/anthropic"')
    expect(plan.endpoint).toBe('https://relay.example.com/anthropic')
  })

  it('refuses a target that needs a model before a model is given', () => {
    expect(() => planImport('pi', { ...inputFor(requiredCase('pi')), model: undefined }))
      .toThrow(/requires a model/)
  })

  it('gives Antigravity the launch command that applies its key', () => {
    const plan = planImport('agy', inputFor(requiredCase('agy')))
    expect(plan.launchCommand).toContain('GEMINI_API_KEY=')
    expect(plan.launchCommand).toContain('GOOGLE_GEMINI_BASE_URL=')
    expect(plan.launchCommand).toContain('--gemini_dir=')
  })

  it('uses the Gemini gateway for gemini_native and the OpenAI gateway otherwise', () => {
    const gemini = planImport('gemini', inputFor(requiredCase('gemini')))
    expect(gemini.endpoint).toBe(endpoints.geminiBaseUrl)
    const codex = planImport('codex', inputFor(requiredCase('codex')))
    expect(codex.endpoint).toBe(endpoints.openAiBaseUrl)
  })
})
