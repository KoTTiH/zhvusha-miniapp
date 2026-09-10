export const OPENROUTER_V4_LITE_MODEL_ID = 'deepseek/deepseek-v4-flash'
export const OPENROUTER_VISION_MODEL_ID = 'google/gemini-2.5-flash'
export const OPENROUTER_STT_MODEL_ID = 'openai/gpt-4o-mini-transcribe'

export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [OPENROUTER_V4_LITE_MODEL_ID]: { input: 0.0983, output: 0.1966 },
  [OPENROUTER_VISION_MODEL_ID]: { input: 0.3, output: 2.5 },
  [OPENROUTER_STT_MODEL_ID]: { input: 1.25, output: 5 },
}
