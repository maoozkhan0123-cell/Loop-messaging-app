import Groq from 'groq-sdk'

// Groq's free tier: ~30 requests/min and a few thousand tokens/min per model, shared by the whole
// workspace. Prompts and tool results are kept short for that reason. Override the model with GROQ_MODEL.
export const AI_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

let client: Groq | null = null

/** Server-only Groq client; null when GROQ_API_KEY is not configured. */
export function getGroq() {
  if (!process.env.GROQ_API_KEY) return null
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 1, timeout: 60_000 })
  return client
}

export { Groq }
