import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AI_MODEL, getGroq, getReasoningOptions } from '@/lib/ai/groq'
import { briefPrompt, collectBriefFacts, fallbackOverview, parseBriefOverview } from '@/lib/ai/dailyBrief'
import { dayInTimeZone, strictDay, validTimeZone } from '@/lib/ai/dailyBriefDates'
import type { DailyBriefLanguage } from '@/types/dailyBrief'

export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers })
  const payload = await request.json().catch(() => null)
  if (!payload || !validTimeZone(payload.timeZone) || !strictDay(payload.day) || !['english', 'roman_urdu'].includes(payload.language)) return NextResponse.json({ error: 'Choose a valid date, timezone and language.' }, { status: 400, headers })
  const now = new Date()
  if (payload.day !== dayInTimeZone(now, payload.timeZone)) return NextResponse.json({ error: 'The day changed. Refresh the page and generate a new brief.' }, { status: 400, headers })
  const language = payload.language as DailyBriefLanguage
  try {
    const facts = await collectBriefFacts(db, user.id, now, payload.timeZone)
    let overview: string | null = null
    const groq = getGroq()
    if (groq) {
      try {
        const response = await groq.chat.completions.create({ model: AI_MODEL, messages: briefPrompt(facts, language), response_format: { type: 'json_object' }, max_completion_tokens: 500, ...getReasoningOptions() }, { maxRetries: 0, timeout: 20_000, signal: request.signal })
        overview = parseBriefOverview(response.choices[0]?.message.content)
      } catch {
        // Tasks and links remain useful when the provider is unavailable or rate limited.
      }
    }
    return NextResponse.json({ ...facts, overview: overview ?? fallbackOverview(facts, language), summarySource: overview ? 'ai' : 'workspace', ...(!overview ? { limitedSources: [...(facts.limitedSources ?? []), 'AI summary is temporarily unavailable. This overview uses your workspace data.'] } : {}) }, { headers })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Your daily brief could not be generated. Please try again.' }, { status: 502, headers })
  }
}
