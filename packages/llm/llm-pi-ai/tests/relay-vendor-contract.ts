// Ground truth for what each vendor's API reference expects, and a probe helper
// that records the exact payload pi-ai produced for one relay model.
//
// Kept in one place so the assertions below and the vendor table they guard
// cannot drift into two different stories.
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions'

/** One vendor's published contract on the OpenAI-compatible Chat Completions door. */
export interface VendorContract {
  /** Field the vendor documents for the output cap. */
  readonly capField: 'max_tokens' | 'max_completion_tokens'
  /**
   * Where the vendor publishes its thinking switch, or `undefined` when its
   * reference documents none. Each entry implies the value that means "on"
   * and "off" for that vendor.
   */
  readonly thinking?: 'deepseek' | 'qwen' | 'moonshot-thinking' | 'reasoning-effort'
}

/**
 * Transcribed from each vendor's own API reference. A vendor absent here is one
 * the relay seed no longer carries; the coverage cases assert that.
 */
export const VENDOR_CONTRACTS: Readonly<Record<string, VendorContract>> = {
  // https://api-docs.deepseek.com/api/create-chat-completion — `max_tokens`,
  // `thinking.type`, `reasoning_effort`, empty `reasoning_content` on tool calls.
  deepseek: { capField: 'max_tokens', thinking: 'deepseek' },
  // https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
  // — `max_tokens`, top-level `enable_thinking`; `max_completion_tokens` is
  // documented as silently ignored.
  alibaba: { capField: 'max_tokens', thinking: 'qwen' },
  // https://docs.bigmodel.cn/cn/guide/start/concept-param — `max_tokens`,
  // `thinking.type`, `reasoning_effort`.
  zhipu: { capField: 'max_tokens', thinking: 'deepseek' },
  // https://platform.kimi.com/docs/api/models-overview — `max_tokens`, and a
  // top-level `thinking` switch for the models that offer one.
  moonshot: { capField: 'max_tokens', thinking: 'moonshot-thinking' },
  // https://docs.volcengine.dev/docs/ark — `max_tokens`; the documented agent
  // guidance passes `thinking` explicitly, but the Chat Completions reference
  // publishes no thinking field, so this build states none rather than guess.
  bytedance: { capField: 'max_tokens' },
  // Tencent HuggingFace/vLLM-served Hunyuan — `max_tokens`, `reasoning_effort`.
  tencent: { capField: 'max_tokens', thinking: 'reasoning-effort' },
  // https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create
  // — `max_tokens`, `reasoning_effort`.
  stepfun: { capField: 'max_tokens', thinking: 'reasoning-effort' },
  // https://developers.openai.com/api/reference/.../create — `max_completion_tokens`
  // (`max_tokens` deprecated and incompatible with o-series), `reasoning_effort`.
  openai: { capField: 'max_completion_tokens', thinking: 'reasoning-effort' },
  // https://docs.x.ai — `max_completion_tokens`, `reasoning_effort`.
  xai: { capField: 'max_completion_tokens', thinking: 'reasoning-effort' },
  // https://mimo.mi.com/docs — `max_completion_tokens`, `reasoning_effort`.
  xiaomi: { capField: 'max_completion_tokens', thinking: 'reasoning-effort' },
  // https://longcat.chat/platform/docs/zh/api/chat — `max_tokens` (per-model
  // ceiling) and a `thinking` switch on the OpenAI-compatible door.
  meituan: { capField: 'max_tokens', thinking: 'deepseek' },
  // https://cloud.baidu.com/doc/qianfan-docs — the OpenAI-compatible mode takes
  // `max_tokens`; the ERNIE line also has a vendor-native protocol, which is
  // not this face.
  baidu: { capField: 'max_tokens' },
}

/** The body pi-ai produced for one model at one thinking level. */
export interface CapturedPayload {
  readonly body: Record<string, unknown>
  readonly error?: string
}

/**
 * Run one relay model through pi-ai's OpenAI transport and return the exact
 * request body it built. `reasoning` is the option `streamSimple` actually
 * reads; passing `reasoningEffort` here would silently measure nothing.
 * @param model - the resolved model to probe.
 * @param thinking - the thinking level to request, or `undefined` to request none.
 * @param maxTokens - the output cap to request.
 * @returns the built body, plus any transport error the probe swallowed.
 */
export async function capturePayload(
  model: Parameters<typeof streamSimple>[0],
  thinking: string | undefined,
  maxTokens = 4096,
): Promise<CapturedPayload> {
  let body: Record<string, unknown> | undefined
  let error: string | undefined
  try {
    for await (const _event of streamSimple(model, { messages: [{ role: 'user', content: 'hi' }] }, {
      apiKey: 'probe',
      maxTokens,
      ...thinking === undefined ? {} : { reasoning: thinking },
      onPayload: (payload) => {
        body = structuredClone(payload) as Record<string, unknown>
        return payload
      },
    })) { /* the request never completes; onPayload is the observation */ }
  } catch (failure) {
    error = String(failure)
  }
  return { body: body ?? {}, ...error === undefined ? {} : { error } }
}
