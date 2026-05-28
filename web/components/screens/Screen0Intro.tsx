'use client'

import { useWizard } from '@/lib/store'

const VIDEO_ID = 'MXLgvww5sl4'
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&modestbranding=1&playsinline=1`

export default function Screen0Intro() {
  const { setScreen } = useWizard()

  return (
    <div className="screen">
      <h2 style={{ marginBottom: '0.5rem' }}>1. Watch this first</h2>
      <p className="intro">
        Step-by-step walkthrough. Everything you need to get your AI assistant live in under 10 minutes.
      </p>

      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%',
          borderRadius: '6px',
          overflow: 'hidden',
          border: '2px solid var(--ink)',
          background: 'var(--panel)',
          margin: '1.5rem 0 2rem',
        }}
      >
        <iframe
          src={EMBED_URL}
          title="NELLO Labs - setup walkthrough"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setScreen(1)}
        style={{ width: '100%', padding: '16px 22px', fontSize: 15, letterSpacing: '0.04em' }}
      >
        Set it up →
      </button>
    </div>
  )
}
