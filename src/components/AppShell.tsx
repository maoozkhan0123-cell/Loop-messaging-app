'use client'

import { useState, useMemo } from 'react'
import { IconRail } from '@/components/sidebar/IconRail'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/Toolbar'
import { motion, AnimatePresence } from 'framer-motion'
import { useProfile } from '@/hooks/useProfile'
import { useChannels } from '@/hooks/useChannels'
import { useGlobalNotifications } from '@/hooks/useGlobalNotifications'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { data: myProfile } = useProfile()
  const { data: channels } = useChannels()

  // Stable channel ID list — used by global notification subscription.
  // useMemo prevents effect re-run on every render (only re-subscribes when membership changes).
  const channelIds = useMemo(
    () => channels?.map((c) => c.id) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channels?.map((c) => c.id).join(',')]
  )

  useGlobalNotifications(myProfile?.id, channelIds)

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0D1F31' }}>
      {/* ── Top toolbar: spans full width (like Slack's top bar) ── */}
      <Toolbar />

      {/* ── Body: icon rail + sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 70px icon rail — always visible */}
        <IconRail
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        {/* Workspace sidebar — collapsible */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="workspace-sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="flex-shrink-0 h-full overflow-hidden"
            >
              <Sidebar />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content area */}
        <div className="flex flex-1 min-w-0 h-full bg-white rounded-tl-xl overflow-hidden shadow-xl">
          {children}
        </div>
      </div>
    </div>
  )
}
