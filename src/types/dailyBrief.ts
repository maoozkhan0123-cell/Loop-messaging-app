export type DailyBriefLanguage = 'english' | 'roman_urdu'

export type DailyBriefLink = {
  id: string
  title: string
  detail: string
  href: string
  kind: 'task' | 'event' | 'channel'
}

export type DailyBrief = {
  day: string
  timeZone: string
  generatedAt: string
  overview: string
  summarySource: 'ai' | 'workspace'
  priorities: DailyBriefLink[]
  discussions: DailyBriefLink[]
  counts: {
    overdue: number
    dueToday: number
    /** Assigned tasks due after today and within the next seven days. */
    upcoming: number
    /** Null means discussion information could not be checked. */
    unreadChannels: number | null
  }
  limitedSources?: string[]
}
