import type { Metadata } from 'next'
import { Figtree, Instrument_Serif } from 'next/font/google'
import './globals.css'
import { MetaPixel } from '@/components/MetaPixel'

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Nello - Your AI Chief Operating Officer',
  description: 'Nello is your AI Chief Operating Officer that actually gets stuff done. They know everything about you, run on your Mac, and just do the work. Setup takes 15 minutes. Your keys stay on your machine.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${instrumentSerif.variable}`}>
      <body>
        <MetaPixel />
        {children}
      </body>
    </html>
  )
}
