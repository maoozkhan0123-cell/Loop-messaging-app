'use client'

import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type AccentPreference = 'violet' | 'slate' | 'midnight' | 'emerald'
export type DensityPreference = 'comfortable' | 'compact'

export type Preferences = {
  theme: ThemePreference
  accent: AccentPreference
  density: DensityPreference
  reducedMotion: boolean
  availability: 'online' | 'away' | 'offline'
  notificationLevel: 'all' | 'mentions' | 'nothing'
  notifyMessages: boolean
  notifyMentions: boolean
  desktopNotifications: boolean
  sound: boolean
  previewNotifications: boolean
  emailSummaries: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  openLinksNewTab: boolean
  compactNav: boolean
  homeRecents: boolean
  enterToSend: boolean
  mediaPreview: boolean
  attachmentPreview: boolean
  markdownHelp: boolean
  language: 'English (US)'
  timezone: string
  clock: '12' | '24'
  highContrast: boolean
  zoom: string
  markRead: 'left-off' | 'newest' | 'unread'
  confirmRead: boolean
  camera: string
  microphone: string
  speaker: string
  readReceipts: boolean
  onlineStatus: boolean
  spellcheck: boolean
  aiSuggestions: boolean
}

const STORAGE_KEY = 'bysync.preferences.v2'

export const defaultPreferences: Preferences = {
  theme: 'system', accent: 'violet', density: 'comfortable', reducedMotion: false,
  availability: 'online', notificationLevel: 'mentions', notifyMessages: true,
  notifyMentions: true, desktopNotifications: false, sound: true,
  previewNotifications: true, emailSummaries: false, quietHoursEnabled: false,
  quietHoursStart: '22:00', quietHoursEnd: '08:00', openLinksNewTab: true,
  compactNav: false, homeRecents: true, enterToSend: true, mediaPreview: true,
  attachmentPreview: true, markdownHelp: true, language: 'English (US)',
  timezone: 'auto', clock: '12', highContrast: false, zoom: '100',
  markRead: 'left-off', confirmRead: true, camera: 'default', microphone: 'default',
  speaker: 'default', readReceipts: true, onlineStatus: true, spellcheck: true,
  aiSuggestions: true,
}

const enumValues: Partial<Record<keyof Preferences, readonly string[]>> = {
  theme: ['system', 'light', 'dark'], accent: ['violet', 'slate', 'midnight', 'emerald'],
  density: ['comfortable', 'compact'], availability: ['online', 'away', 'offline'],
  notificationLevel: ['all', 'mentions', 'nothing'], language: ['English (US)'],
  clock: ['12', '24'], markRead: ['left-off', 'newest', 'unread'],
}

export function validatePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return defaultPreferences
  const source = value as Record<string, unknown>
  const next = { ...defaultPreferences }
  for (const key of Object.keys(defaultPreferences) as (keyof Preferences)[]) {
    const candidate = source[key]
    const fallback = defaultPreferences[key]
    const allowed = enumValues[key]
    if (allowed) {
      if (typeof candidate === 'string' && allowed.includes(candidate)) (next as Record<string, unknown>)[key] = candidate
    } else if (typeof candidate === typeof fallback) {
      (next as Record<string, unknown>)[key] = candidate
    }
  }
  return next
}

type PreferencesContextValue = {
  preferences: Preferences
  hydrated: boolean
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  resetPreferences: () => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function applyDocumentPreferences(preferences: Preferences) {
  const root = document.documentElement
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolvedTheme = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
  root.dataset.theme = resolvedTheme
  root.dataset.accent = preferences.accent
  root.dataset.density = preferences.density
  root.classList.toggle('reduce-motion', preferences.reducedMotion)
  root.classList.toggle('high-contrast', preferences.highContrast)
  root.style.fontSize = `${Number(preferences.zoom) || 100}%`
  root.style.colorScheme = resolvedTheme
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      setPreferences(validatePreferences(raw ? JSON.parse(raw) : null))
    } catch { setPreferences(defaultPreferences) }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    applyDocumentPreferences(preferences)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch {}
  }, [preferences, hydrated])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemTheme = () => { if (preferences.theme === 'system') applyDocumentPreferences(preferences) }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try { setPreferences(validatePreferences(JSON.parse(event.newValue))) } catch {}
    }
    media.addEventListener('change', handleSystemTheme)
    window.addEventListener('storage', handleStorage)
    return () => { media.removeEventListener('change', handleSystemTheme); window.removeEventListener('storage', handleStorage) }
  }, [preferences])

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }, [])
  const resetPreferences = useCallback(() => setPreferences(defaultPreferences), [])
  const value = useMemo(() => ({ preferences, hydrated, setPreference, resetPreferences }), [preferences, hydrated, setPreference, resetPreferences])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
