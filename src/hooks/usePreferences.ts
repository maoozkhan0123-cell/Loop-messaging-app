'use client'

import { useContext } from 'react'
import { PreferencesContext } from '@/contexts/PreferencesProvider'

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider')
  return context
}
