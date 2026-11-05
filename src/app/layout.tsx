import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Toaster } from '@/components/ui/Toaster'

export const metadata: Metadata = {
  title: 'Bytechsol — Team Communication & Work Management',
  description: 'One workspace for team messaging, projects, files, tasks, and ideas',
  applicationName: 'Bytechsol',
  icons: { icon: '/bytechsol-mark.png' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <Providers>
          <Toaster>{children}</Toaster>
        </Providers>
        <Script src="https://cdn.lordicon.com/lordicon.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
