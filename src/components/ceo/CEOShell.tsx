'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Bell, BriefcaseBusiness, CalendarDays, ChevronLeft, ClipboardList, Command, LayoutDashboard, LogOut, Menu, Users, X } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const items = [
  ['/ceo/dashboard','Overview',LayoutDashboard], ['/ceo/employees','Employees',Users], ['/ceo/tasks','Tasks',ClipboardList],
  ['/ceo/projects','Projects',BriefcaseBusiness], ['/ceo/calendar','Calendar',CalendarDays], ['/ceo/reports','Reports',BarChart3], ['/ceo/activity','Activity',Bell],
] as const

export function CEOShell({ children, name }: { children: React.ReactNode; name: string }) {
  const pathname = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false)
  const signOut = async () => { await createClient().auth.signOut(); router.replace('/login') }
  return <div className="flex h-dvh overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={() => setOpen(false)}/>} 
    <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#151832] text-white transition-transform md:static md:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5"><Link href="/ceo/dashboard" className="font-black tracking-tight">BySync <span className="text-[#39B7EA]">Executive</span></Link><button className="md:hidden" onClick={() => setOpen(false)}><X size={19}/></button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="CEO navigation">{items.map(([href,label,Icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', pathname === href ? 'bg-[#289ED8] text-white shadow-lg shadow-[#289ED8]/20' : 'text-blue-100/70 hover:bg-white/10 hover:text-white')}><Icon size={17}/>{label}</Link>)}</nav>
      <div className="border-t border-white/10 p-3"><Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-blue-100/70 hover:bg-white/10"><ChevronLeft size={14}/>Employee workspace</Link><button onClick={() => void signOut()} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-blue-100/70 hover:bg-red-500/15 hover:text-red-200"><LogOut size={14}/>Sign out</button></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 items-center gap-3 border-b border-[var(--ui-border)] bg-[var(--surface)] px-4 sm:px-6"><button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(true)}><Menu size={19}/></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">CEO Command Center</p><p className="truncate text-[11px] text-[var(--text-muted)]">Signed in as {name}</p></div><button onClick={() => window.dispatchEvent(new Event('open-search'))} className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--ui-border)] px-3 text-xs text-[var(--text-muted)] sm:flex"><Command size={14}/>Quick search <kbd>Ctrl K</kbd></button></header><main className="min-h-0 flex-1 overflow-y-auto">{children}</main></div>
  </div>
}
