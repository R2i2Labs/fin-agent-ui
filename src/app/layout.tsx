import type { Metadata } from 'next'
import { DM_Mono, Geist } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import PasswordProtection from '@/components/playground/PasswordProtection'

const geistSans = Geist({
  variable: '--font-geist-sans',
  weight: '400',
  subsets: ['latin']
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: '400'
})

export const metadata: Metadata = {
  title: 'Agent UI',
  description:
    'A modern chat interface for AI agents built with Next.js, Tailwind CSS, and TypeScript. This template provides a ready-to-use UI for interacting with Agno agents.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${dmMono.variable} antialiased`}>
        <PasswordProtection>
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster />
        </PasswordProtection>
      </body>
    </html>
  )
}