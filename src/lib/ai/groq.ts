import Groq from 'groq-sdk'

// Keep prompts and tool results bounded; model limits are shared by the workspace.
// Override the model with GROQ_MODEL.
export const AI_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

/** These options are supported by GPT-OSS, but not every model available through Groq. */
export function getReasoningOptions(model = AI_MODEL) {
  return /^openai\/gpt-oss-(20b|120b)$/.test(model)
    ? { include_reasoning: false, reasoning_effort: 'low' as const }
    : {}
}

let client: Groq | null = null

/** Server-only Groq client; null when GROQ_API_KEY is not configured. */
export function getGroq() {
  if (!process.env.GROQ_API_KEY) return null
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 1, timeout: 60_000 })
  return client
}

export { Groq }
