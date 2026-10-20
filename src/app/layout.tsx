import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Toaster } from '@/components/ui/Toaster'

export const metadata: Metadata = {
  title: 'Loop — Team Communication & Collaboration',
  description: 'Internal team workspace for messaging, projects, and ideas',
  icons: { icon: '/loop-logo.svg' },
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
          {children}
          <Toaster />
        </Providers>
        <Script src="https://cdn.lordicon.com/lordicon.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
