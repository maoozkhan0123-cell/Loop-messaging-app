/** Manual availability and privacy settings take precedence over tab visibility. */
export function resolvePresenceStatus(availability: 'online' | 'away' | 'offline', showOnlineStatus: boolean, hidden: boolean) {
  if (!showOnlineStatus || availability === 'offline') return 'offline'
  if (availability === 'away' || hidden) return 'away'
  return 'online'
}
