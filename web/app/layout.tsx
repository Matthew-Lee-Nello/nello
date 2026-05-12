import type { Metadata } from 'next'
import { Figtree, Instrument_Serif } from 'next/font/google'
import './globals.css'

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
  title: 'NELLO Labs - Your AI Chief Operations Officer',
  description: 'An AI Chief Operations Officer who knows everything about you, runs on your Mac, and just does the work. Setup takes 10 minutes. Your keys stay on your machine. Built on the nello-claw workspace.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
