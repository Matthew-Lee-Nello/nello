'use client'

import { useEffect } from 'react'

export default function LeadCaptured() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'nello-lead-submitted' }, window.location.origin)
      return
    }

    try { localStorage.setItem('nello-lead-captured', '1') } catch {}
    window.location.replace('/wizard')
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--accent)',
              animation: 'lead-pulse 1.4s ease-in-out infinite',
            }}
          />
          CAPTURED
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>Loading your setup…</p>
      </div>
      <style>{`
        @keyframes lead-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  )
}
