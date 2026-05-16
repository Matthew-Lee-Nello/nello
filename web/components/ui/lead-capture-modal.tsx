'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Script from 'next/script'

interface Props {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
}

const FORM_ID = '84Z80UYtLX88T8AwewTB'
const FORM_ORIGIN = 'https://booking.nello.gg'

export function LeadCaptureModal({ open, onClose, onSubmitted }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== FORM_ORIGIN) return
      const data = e.data
      const type = typeof data === 'string' ? data : data?.type || data?.event
      if (typeof type === 'string' && /submit|success|complete/i.test(type)) {
        onSubmitted()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [open, onSubmitted])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-[var(--bg)] border-2 border-[var(--ink)] rounded-md w-full max-w-[520px] max-h-[90vh] overflow-hidden flex flex-col shadow-[0_24px_60px_-12px_rgba(20,17,14,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-label="Get started"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-[var(--muted)]">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)] animate-pulse" />
                ONE LAST STEP
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-7 h-7 flex items-center justify-center text-[var(--ink)] opacity-50 hover:opacity-100 text-lg leading-none rounded-sm hover:bg-[var(--panel)] transition"
              >
                ×
              </button>
            </div>

            <div className="overflow-auto" style={{ height: 'min(560px, 80vh)' }}>
              <iframe
                src={`${FORM_ORIGIN}/widget/form/${FORM_ID}`}
                style={{ width: '100%', height: '100%', minHeight: 500, border: 'none', display: 'block' }}
                id={`inline-${FORM_ID}`}
                data-layout="{'id':'INLINE'}"
                data-trigger-type="alwaysShow"
                data-activation-type="alwaysActivated"
                data-deactivation-type="neverDeactivate"
                data-form-name="labs.nello.gg form"
                data-height="433"
                data-layout-iframe-id={`inline-${FORM_ID}`}
                data-form-id={FORM_ID}
                title="labs.nello.gg form"
              />
            </div>
          </motion.div>

          <Script src={`${FORM_ORIGIN}/js/form_embed.js`} strategy="afterInteractive" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
