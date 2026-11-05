'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/Toaster'
import {
  getNotificationPref, setNotificationPref,
  requestNotificationPermission,
} from '@/lib/notifications'

export function useNotifications() {
  const { toast } = useToast()
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
      toast({ title: 'Notifications are blocked', description: 'Allow notifications for this site in your browser settings, then try again.', type: 'error' })
    } else {
      toast({ title: 'Notifications are not supported', description: 'This browser cannot show desktop notifications.', type: 'error' })
    }
  }, [enabled, toast])

  return { enabled, permission, toggle }
}
