'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getNotificationPref, setNotificationPref,
  requestNotificationPermission,
} from '@/lib/notifications'

export function useNotifications() {
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  // Hydrate from localStorage (avoid SSR mismatch)
  useEffect(() => {
    setEnabled(getNotificationPref())
    if ('Notification' in window) {
      setPermission(Notification.permission)
    } else {
      setPermission('unsupported' as NotificationPermission)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (enabled) {
      setNotificationPref(false)
      setEnabled(false)
      return
    }
    const result = await requestNotificationPermission()
    if (result === 'granted') {
      setNotificationPref(true)
      setEnabled(true)
      setPermission('granted')
    } else if (result === 'denied') {
      setPermission('denied')
      alert('Notifications are blocked by your browser.\nGo to browser settings → site permissions to allow them.')
    } else {
      alert('Desktop notifications are not supported in this browser.')
    }
  }, [enabled])

  return { enabled, permission, toggle }
}
