import { AppShell } from '@/components/AppShell'
import { CommandPalette } from '@/components/CommandPalette'
import { SearchOverlay } from '@/components/search/SearchOverlay'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandPalette />
      <SearchOverlay />
    </>
  )
}
