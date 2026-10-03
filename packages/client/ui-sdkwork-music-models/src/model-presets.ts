/**
 * Generated official-vendor and model presets for the SDKWork music model
 * configuration page: the catalog's own music generation vendors with their canonical
 * API roots, and every catalog model in that modality.
 *
 * Source: sdkwork-models catalog 2026.09.17.1 (generatedAt 2026-09-17T00:00:00Z).
 * Regenerate with `node scripts/generate-sdkwork-model-presets.mjs`; do not edit by hand.
 */

/** One official vendor root the music settings page can seed. */
export interface SdkworkMusicVendorPreset {
  /** sdkwork-models vendor code. */
  readonly vendor: string
  /** Vendor name as the catalog spells it. */
  readonly displayName: string
  /** Catalog region this root belongs to (`global`, `cn`). */
  readonly region: string
  /** Preferred protocol code; empty when the catalog publishes no compatible root. */
  readonly protocol: string
  /** Canonical API root; empty when the catalog publishes no compatible root. */
  readonly baseUrl: string
  /** Every protocol code the vendor publishes a root for. */
  readonly protocols: readonly string[]
}

/** One catalog model the music settings page can offer. */
export interface SdkworkMusicModelPreset {
  /** Catalog key (`<vendor>/<modelId>`). */
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

/** Official vendor roots with a music capability. */
export const OFFICIAL_MUSIC_VENDOR_PRESETS: readonly SdkworkMusicVendorPreset[] = [
  {
    vendor: 'bytedance',
    displayName: 'ByteDance',
    region: 'cn',
    protocol: 'openai_compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocols: ['openai_compatible', 'openai_responses'],
  },
  {
    vendor: 'elevenlabs',
    displayName: 'ElevenLabs',
    region: 'global',
    protocol: '',
    baseUrl: '',
    protocols: [],
  },
  {
    vendor: 'google',
    displayName: 'Google',
    region: 'global',
    protocol: 'openai_compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    protocols: ['openai_compatible'],
  },
  {
    vendor: 'minimax',
    displayName: 'MiniMax',
    region: 'cn',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    protocols: ['openai_compatible'],
  },
  {
    vendor: 'minimax',
    displayName: 'MiniMax',
    region: 'global',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    protocols: ['openai_compatible'],
  },
  {
    vendor: 'mureka',
    displayName: 'Mureka',
    region: 'global',
    protocol: '',
    baseUrl: '',
    protocols: [],
  },
  {
    vendor: 'stability_ai',
    displayName: 'Stability AI',
    region: 'global',
    protocol: '',
    baseUrl: '',
    protocols: [],
  },
  {
    vendor: 'suno',
    displayName: 'Suno',
    region: 'global',
    protocol: '',
    baseUrl: '',
    protocols: [],
  },
]

/** Every catalog model whose primary capability is music. */
export const CATALOG_MUSIC_MODEL_PRESETS: readonly SdkworkMusicModelPreset[] = [
  {
    catalogKey: 'bytedance/seed-music-gensong-v4',
    modelId: 'seed-music-gensong-v4',
    displayName: 'Seed Music GenSong V4',
    vendor: 'bytedance',
    region: 'cn',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'elevenlabs/music_v1',
    modelId: 'music_v1',
    displayName: 'Eleven Music v1',
    vendor: 'elevenlabs',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'elevenlabs/music_v2',
    modelId: 'music_v2',
    displayName: 'Eleven Music v2',
    vendor: 'elevenlabs',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'elevenlabs/music_v2_5',
    modelId: 'music_v2_5',
    displayName: 'Eleven Music v2.5',
    vendor: 'elevenlabs',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'google/lyria-2',
    modelId: 'lyria-2',
    displayName: 'Lyria 2',
    vendor: 'google',
    region: 'global',
    apiFormat: 'google_gemini',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'google/lyria-3',
    modelId: 'lyria-3',
    displayName: 'Lyria 3',
    vendor: 'google',
    region: 'global',
    apiFormat: 'google_gemini',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'google/lyria-3-clip-preview',
    modelId: 'lyria-3-clip-preview',
    displayName: 'Lyria 3 Clip Preview',
    vendor: 'google',
    region: 'global',
    apiFormat: 'google_gemini',
    lifecycle: 'preview',
  },
  {
    catalogKey: 'google/lyria-3-pro-preview',
    modelId: 'lyria-3-pro-preview',
    displayName: 'Lyria 3 Pro Preview',
    vendor: 'google',
    region: 'global',
    apiFormat: 'google_gemini',
    lifecycle: 'preview',
  },
  {
    catalogKey: 'google/lyria-3.5',
    modelId: 'lyria-3.5',
    displayName: 'Lyria 3.5',
    vendor: 'google',
    region: 'global',
    apiFormat: 'google_gemini',
    lifecycle: 'active',
  },
  {
    catalogKey: 'minimax/music-2.6',
    modelId: 'music-2.6',
    displayName: 'MiniMax Music 2.6',
    vendor: 'minimax',
    region: 'cn',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'minimax/music-2.6',
    modelId: 'music-2.6',
    displayName: 'MiniMax Music 2.6',
    vendor: 'minimax',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'minimax/music-3.0',
    modelId: 'music-3.0',
    displayName: 'MiniMax Music 3.0',
    vendor: 'minimax',
    region: 'cn',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'minimax/music-3.0',
    modelId: 'music-3.0',
    displayName: 'MiniMax Music 3.0',
    vendor: 'minimax',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'minimax/music-cover',
    modelId: 'music-cover',
    displayName: 'MiniMax Music Cover',
    vendor: 'minimax',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'mureka/mureka-o1',
    modelId: 'mureka-o1',
    displayName: 'Mureka O1',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'mureka/mureka-o2',
    modelId: 'mureka-o2',
    displayName: 'Mureka O2',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'mureka/mureka-o3',
    modelId: 'mureka-o3',
    displayName: 'Mureka O3',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'mureka/mureka-v7.5',
    modelId: 'mureka-v7.5',
    displayName: 'Mureka V7.5',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'mureka/mureka-v7.6',
    modelId: 'mureka-v7.6',
    displayName: 'Mureka V7.6',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'mureka/mureka-v8',
    modelId: 'mureka-v8',
    displayName: 'Mureka V8',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'mureka/mureka-v9',
    modelId: 'mureka-v9',
    displayName: 'Mureka V9',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'mureka/mureka-v9.5',
    modelId: 'mureka-v9.5',
    displayName: 'Mureka V9.5',
    vendor: 'mureka',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'stability_ai/stable-audio-2.5',
    modelId: 'stable-audio-2.5',
    displayName: 'Stable Audio 2.5',
    vendor: 'stability_ai',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'stability_ai/stable-audio-3.0',
    modelId: 'stable-audio-3.0',
    displayName: 'Stable Audio 3.0',
    vendor: 'stability_ai',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'active',
  },
  {
    catalogKey: 'suno/suno-v5',
    modelId: 'suno-v5',
    displayName: 'Suno v5',
    vendor: 'suno',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'suno/suno-v5.5',
    modelId: 'suno-v5.5',
    displayName: 'Suno v5.5',
    vendor: 'suno',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'deprecated',
  },
  {
    catalogKey: 'suno/suno-v6',
    modelId: 'suno-v6',
    displayName: 'Suno v6',
    vendor: 'suno',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'catalog_only',
  },
  {
    catalogKey: 'suno/suno-v6-mini',
    modelId: 'suno-v6-mini',
    displayName: 'Suno v6 Mini',
    vendor: 'suno',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'catalog_only',
  },
  {
    catalogKey: 'suno/suno-v6-wild',
    modelId: 'suno-v6-wild',
    displayName: 'Suno v6 Wild',
    vendor: 'suno',
    region: 'global',
    apiFormat: 'vendor_native',
    lifecycle: 'catalog_only',
  },
]
