// Browser desktop notification utilities (same-browser/same-device only)
// Cross-browser/cross-device requires Push API + Service Worker + VAPID — not implemented here.

const PREF_KEY = 'bysync_notifications_enabled'

export function getNotificationPref(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(PREF_KEY) === 'true'
}

export function setNotificationPref(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, String(enabled))
}

/** Request permission if needed, store pref, returns final enabled state */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result === 'granted' ? 'granted' : 'denied'
}

/**
 * Fire a desktop notification if:
 *  - User has opted in (localStorage pref)
 *  - Browser permission is granted
 *  - The document is NOT focused (user is away / on a different tab)
 */
export function maybeNotify(title: string, body: string, icon = '/bysync-logo.svg'): void {
  if (!getNotificationPref()) return
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.hasFocus()) return

  try {
    const n = new Notification(title, { body, icon, tag: 'bysync-msg' })
    n.onclick = () => { window.focus(); n.close() }
  } catch {
    // silently ignore (e.g., Safari quirks)
  }
}
