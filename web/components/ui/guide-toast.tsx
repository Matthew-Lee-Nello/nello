'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STORAGE_KEY = 'nello-guide-toast-dismissed'
const GUIDE_URL = 'https://www.youtube.com/watch?v=TBD' // TODO: Matt to paste real URL
const SHOW_DELAY_MS = 2500

export function GuideToast() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
    } catch {
      // localStorage may be unavailable (private mode, SSR weirdness) — proceed.
    }
    const t = setTimeout(() => setShow(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          role="status"
          aria-live="polite"
          className="
            fixed z-50
            bottom-4 left-4 right-4
            md:bottom-6 md:right-6 md:left-auto md:max-w-[380px]
            bg-[var(--bg)] border-2 border-[var(--ink)]
            rounded-md shadow-[0_8px_24px_-6px_rgba(20,17,14,0.18)]
            p-4 pr-11
            font-mono text-[12px] text-[var(--ink)]
            leading-relaxed
          "
        >
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-1.5 right-1.5 w-9 h-9 flex items-center justify-center text-[var(--ink)] opacity-50 hover:opacity-100 text-[16px] leading-none rounded-sm hover:bg-[var(--panel)] transition"
          >
            ×
          </button>
          <div className="flex items-center gap-2 mb-2 text-[9px] tracking-[0.22em] uppercase opacity-60">
            <span className="w-1 h-1 rounded-full bg-[var(--accent)] animate-pulse" />
            NEW HERE?
          </div>
          Haven't watched the guide and don't know where to start?{' '}
          <a
            href={GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-strong)] transition-colors"
          >
            click here
          </a>
          .
        </motion.div>
      )}
    </AnimatePresence>
  )
}
