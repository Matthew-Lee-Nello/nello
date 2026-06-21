'use client'

import { useEffect, useState } from 'react'
import { fireMetaLead } from '@/lib/meta-lead'

const VIDEO_ID = 'MXLgvww5sl4'
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&modestbranding=1&playsinline=1`

// Thin, stable pointer. All install logic lives in the versioned INSTALL_GUIDE.md
// in the repo, so we change how the install behaves without ever changing the
// prompt this page hands out. Claude clones, reads the guide, and runs the
// interview from there.
const PASTE_PROMPT = `Install nello-claw for me. Clone https://github.com/Matthew-Lee-Nello/nello-claw into the empty folder VS Code has open, then read SECURITY.md and INSTALL_GUIDE.md and follow INSTALL_GUIDE.md — it's an interview that sets me up end to end. Ask me before anything destructive, and adapt the commands to my operating system.`

export default function Screen0Intro() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fireMetaLead()
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(PASTE_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="screen">
      <h2 style={{ marginBottom: '0.5rem' }}>Watch this, then paste one prompt</h2>
      <p className="intro">
        Two steps. Watch the walkthrough, then copy the prompt below into Claude Code. Your
        assistant interviews you, sets up everything, and goes live. Around 15 minutes.
      </p>
      <p className="intro" style={{ marginTop: '0.5rem', fontSize: '0.9em', opacity: 0.8 }}>
        Install three free apps first - that is everything you set up by hand; your assistant
        installs the rest.{' '}
        <a href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Claude Code</a>{' '}
        (the engine that does the work),{' '}
        <a href="https://code.visualstudio.com/download" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>VS Code</a>{' '}
        (to open your project folder), and{' '}
        <a href="https://obsidian.md/download" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Obsidian</a>{' '}
        (where your assistant keeps its memory).
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>

      <h3 style={{ marginBottom: '0.5rem' }}>Copy this into Claude Code</h3>
      <div
        style={{
          margin: '8px 0 12px',
          padding: 12,
          border: '1px solid var(--accent)',
          borderRadius: 8,
          background: 'var(--accent-dim)',
          fontSize: 13,
        }}
      >
        <strong style={{ color: 'var(--accent)' }}>First:</strong> open an empty folder in VS Code,
        then hit{' '}
        <kbd style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
          Shift+Tab
        </kbd>{' '}
        twice in Claude Code to switch on <strong>Plan Mode</strong> — your assistant shows you every
        step before it runs anything.
      </div>

      <div
        className="install-command"
        onClick={copy}
        title="Click to copy"
        style={{ cursor: 'pointer' }}
      >
        {PASTE_PROMPT}
      </div>
      <button onClick={copy} style={{ width: '100%', padding: '16px 22px', fontSize: 15, letterSpacing: '0.04em' }}>
        {copied ? 'Copied ✓' : 'Copy prompt'}
      </button>

      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
        Your assistant clones the repo, interviews you about your work and tools, walks you through
        each connection, builds your company brain, and opens the dashboard. When it finishes, send
        your Telegram bot a message to link your phone.
      </p>
    </div>
  )
}
