'use client'

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useState, useMemo, useEffect, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import { IconRail } from '@/components/sidebar/IconRail'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/Toolbar'
import { motion, AnimatePresence } from 'framer-motion'
import { useProfile } from '@/hooks/useProfile'
import { useChannels } from '@/hooks/useChannels'
import { useGlobalNotifications } from '@/hooks/useGlobalNotifications'
import { X } from 'lucide-react'
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'

interface MobileNavContextType {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  toggleMobileMenu: () => void
  closeMobileMenu: () => void
}

export const MobileNavContext = createContext<MobileNavContextType>({
  mobileMenuOpen: false,
  setMobileMenuOpen: () => {},
  toggleMobileMenu: () => {},
  closeMobileMenu: () => {},
})

export const useMobileNav = () => useContext(MobileNavContext)

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMessagingRoute = pathname === '/messages' || pathname.startsWith('/dm/') || pathname.startsWith('/channel/')
  const [sidebarOpen, setSidebarOpen] = useState(isMessagingRoute)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { data: myProfile } = useProfile()
  const { data: channels } = useChannels()

  // Keep the directory status in sync with this browser session.
  useEffect(() => {
    if (!myProfile?.id) return
    const supabase = createClient()
    const setStatus = (status: 'online' | 'away' | 'offline') => {
      void supabase.from('profiles').update({ status }).eq('id', myProfile.id)
    }
    // A normal request is cancelled when the tab closes, which left people "online" forever.
    // keepalive lets the offline update finish after the page is gone; it needs the token up front.
    let accessToken: string | null = null
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => { accessToken = data.session?.access_token ?? null })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => { accessToken = session?.access_token ?? null })
    const sendOfflineOnExit = () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key || !accessToken) return
      void fetch(`${url}/rest/v1/profiles?id=eq.${myProfile.id}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'offline' }),
      }).catch(() => undefined)
    }
    const current = () => (document.hidden ? 'away' : 'online')
    const handleVisibility = () => setStatus(current())
    const handlePageHide = () => sendOfflineOnExit()
    // Re-assert presence regularly so a status overwritten elsewhere (another tab closing) corrects itself.
    const heartbeat = window.setInterval(() => setStatus(current()), 60_000)
    setStatus(current())
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.clearInterval(heartbeat)
      authListener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      setStatus('offline')
    }
  }, [myProfile?.id])

  // Auto-close mobile navigation drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setSidebarOpen(pathname === '/messages' || pathname.startsWith('/dm/') || pathname.startsWith('/channel/'))
  }, [pathname])

  // Stable channel ID list — used by global notification subscription.
  const channelIds = useMemo(
    () => channels?.map((c) => c.id) ?? [],
    [channels]
  )

  useGlobalNotifications(myProfile?.id, channelIds)

  const toggleMobileMenu = () => setMobileMenuOpen((v) => !v)
  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <MobileNavContext.Provider
      value={{ mobileMenuOpen, setMobileMenuOpen, toggleMobileMenu, closeMobileMenu }}
    >
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--app-bg)' }}>
        {/* ── Top toolbar: spans full width ── */}
        <Toolbar />
        <ConfirmDialogHost />

        {/* ── Body: sidebar (desktop/mobile) + content ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative md:pt-2" style={{ background: '#171936' }}>
          {/* Desktop view: side-by-side icon rail + workspace sidebar */}
          <div className="hidden md:flex flex-shrink-0 h-full">
            <IconRail
              onOpenSidebar={() => setSidebarOpen(true)}
              onCloseSidebar={() => setSidebarOpen(false)}
              joinsSidebar={sidebarOpen}
            />

            <AnimatePresence initial={false}>
              {sidebarOpen && (
                <motion.div
                  key="workspace-sidebar"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 260, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className="flex-shrink-0 h-full overflow-hidden md:rounded-tl-2xl"
                >
                  <Sidebar />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile view: slide-over navigation drawer with backdrop */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <>
                {/* Overlay backdrop */}
                <motion.div
                  key="mobile-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={closeMobileMenu}
                  className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
                />

                {/* Mobile Drawer */}
                <motion.div
                  key="mobile-drawer"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                  className="fixed top-0 left-0 bottom-0 z-50 flex shadow-2xl md:hidden max-w-[85vw]"
                >
                  <div className="flex h-full">
                    <IconRail
                      compact
                      onOpenSidebar={() => {}}
                      onCloseSidebar={closeMobileMenu}
                    />
                    <div className="h-full relative">
                      <Sidebar />
                      {/* Close button inside mobile menu */}
                      <button
                        type="button"
                        onClick={closeMobileMenu}
                        className="absolute top-3 right-3 p-1 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors z-30"
                        title="Close menu"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Main content area */}
          <div className="flex flex-1 min-w-0 h-full overflow-hidden md:rounded-tl-2xl" style={{ background: 'var(--app-bg)' }}>
            {children}
          </div>
        </div>
      </div>
    </MobileNavContext.Provider>
  )
}
