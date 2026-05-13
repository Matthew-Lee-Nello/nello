'use client'

import { useState } from 'react'
import { useWizard } from '@/lib/store'

const PASTE_PROMPT = `Please install nello-claw for me into the folder VS Code currently has open.

The reference docs are at https://github.com/Matthew-Lee-Nello/nello-claw - read INSTALL_GUIDE.md and SECURITY.md so you know what the install does and does not do.

The actual install steps:
1. Confirm the current folder is empty (or only contains bundle.json). If not, stop and ask me to pick a fresh folder.
2. git clone https://github.com/Matthew-Lee-Nello/nello-claw.git . (clone into current folder)
3. pnpm install
4. pnpm -r --filter '!@nc/web' build && pnpm --filter nello-claw-template build
5. cp ~/Downloads/nello-claw-bundle.json ./bundle.json
6. NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js

Before running the bootstrap, summarise everything it will change on my system and let me approve. The bootstrap prints its own change summary too.

After the bootstrap finishes, tell me to run /nello-start in this same terminal to begin onboarding - that skill walks me through what's been set up and hands off to /nello-build for wiring my first features.

Adapt the commands for my OS (Mac/Windows/Linux). Ask me before any destructive operation.`

const MAC_FALLBACK = 'curl -fsSL https://labs.nello.gg/i/mac | bash'
const LINUX_FALLBACK = 'curl -fsSL https://labs.nello.gg/i/linux | bash'
const WIN_FALLBACK = 'irm https://labs.nello.gg/i/win | iex'

function mask(s: string): string {
  if (!s) return '(empty)'
  if (s.length <= 8) return '****'
  return s.slice(0, 4) + '...' + s.slice(-4)
}

// Detect platform from the actual browser instead of trusting `bundle.platform`,
// which is hard-coded to 'mac' in defaults.ts and never updated by any UI. The
// old fallback showed Mac users the right command, but every Linux user saw
// the Mac line and every Windows user the same — confusing the few who relied
// on this fallback path. Server-side rendering returns 'mac' (it's the safe
// default for the static build); a client-side replacement happens on hydrate.
function detectPlatform(): 'mac' | 'windows' | 'linux' {
  if (typeof navigator === 'undefined') return 'mac'
  const ua = navigator.userAgent?.toLowerCase() || ''
  const p = navigator.platform?.toLowerCase() || ''
  if (p.includes('win') || ua.includes('windows')) return 'windows'
  if (p.includes('linux') || (ua.includes('linux') && !ua.includes('android'))) return 'linux'
  return 'mac'
}
function fallbackFor(platform: 'mac' | 'windows' | 'linux'): string {
  if (platform === 'windows') return WIN_FALLBACK
  if (platform === 'linux') return LINUX_FALLBACK
  return MAC_FALLBACK
}

export default function Screen4Build() {
  const { bundle } = useWizard()
  const [compiling, setCompiling] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const compileAndDownload = async () => {
    setCompiling(true)
    setError(null)
    try {
      // Call /api/compile FIRST so a network failure does not leave a secret-
      // bearing bundle file in the user's Downloads with no working token /
      // install instructions. On success we download the bundle and surface
      // the install prompt; on failure the user gets a retry-friendly error
      // instead of a half-finished state.
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { at: Date.now() } }),
      })
      if (!res.ok) {
        const detail = res.status === 429 ? 'Too many builds. Wait a minute and try again.' : `Compile failed (HTTP ${res.status}). Try again.`
        setError(detail)
        return
      }
      let data: { token?: unknown } = {}
      try { data = await res.json() } catch { setError('Compile returned an unreadable response. Try again.'); return }
      if (typeof data.token !== 'string') {
        setError('Compile returned no token. Try again.')
        return
      }

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nello-claw-bundle.json'
      a.click()
      URL.revokeObjectURL(url)

      setToken(data.token)
    } finally {
      setCompiling(false)
    }
  }

  return (
    <div className="screen">
      <h2>4. Review and build</h2>
      <p className="intro">Quick check, then we hand you the install command.</p>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, fontSize: 14, lineHeight: 1.7 }}>
        <div><strong>You:</strong> {bundle.name || '(missing)'}</div>
        <div><strong>Assistant name:</strong> {bundle.assistantName || '(missing)'}</div>
        <div><strong>Occupation:</strong> {bundle.occupation || '(missing)'}</div>
        <div style={{ marginTop: 8 }}><strong>About you:</strong></div>
        <div style={{ color: 'var(--muted)', marginLeft: 12, fontStyle: 'italic' }}>
          {bundle.bio || '(missing)'}
        </div>
        <div style={{ marginTop: 12 }}><strong>Telegram bot:</strong> {mask(bundle.keys.TELEGRAM_BOT_TOKEN ?? '')}</div>
        <div><strong>Google email:</strong> {bundle.keys.GOOGLE_USER_EMAIL || '(missing)'}</div>
        <div><strong>Google OAuth ID:</strong> {mask(bundle.keys.GOOGLE_OAUTH_CLIENT_ID ?? '')}</div>
        <div><strong>Google OAuth Secret:</strong> {mask(bundle.keys.GOOGLE_OAUTH_CLIENT_SECRET ?? '')}</div>
      </div>

      <div style={{ marginTop: 20, padding: 16, background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13 }}>
        <strong style={{ color: 'var(--accent)' }}>Want web search / scraping / Notion / Linear / anything else?</strong>
        {' '}Once your assistant is running, just say <em>&quot;find me a connection for X&quot;</em> in the dashboard. It searches the open ecosystem, walks you through getting any keys you need, installs it. No need to add anything here.
      </div>

      <div className="nav-buttons">
        <button className="secondary" onClick={() => window.history.back()}>Back</button>
        <button onClick={compileAndDownload} disabled={compiling}>
          {compiling ? 'Building...' : 'Build my assistant'}
        </button>
      </div>

      {token && (
        <div style={{ marginTop: 32 }}>
          <h3>Last step</h3>
          <p>
            Your setup downloaded to <code>~/Downloads/nello-claw-bundle.json</code>.
            Open Claude Code and paste this:
          </p>

          <div style={{
            margin: '12px 0',
            padding: 12,
            border: '1px solid var(--accent)',
            borderRadius: 8,
            background: 'var(--accent-dim)',
            fontSize: 13,
          }}>
            <strong style={{ color: 'var(--accent)' }}>Tip:</strong> hit{' '}
            <kbd style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>Shift+Tab</kbd>{' '}twice in Claude Code first to switch on <strong>Plan Mode</strong>.
            Your assistant will write out exactly what it is about to do before doing anything. Approve, then it runs.
          </div>

          <div
            className="install-command"
            onClick={() => { navigator.clipboard.writeText(PASTE_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            title="Click to copy"
            style={{ cursor: 'pointer' }}
          >
            {PASTE_PROMPT}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(PASTE_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>

          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
            Your assistant clones the repo, builds, configures everything, and opens the dashboard.
            About 5 minutes. Works on Mac, Windows and Linux.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
            When the dashboard opens, send a message to your Telegram bot to finish.
            That last step links your phone to your assistant.
          </p>

          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 32 }}>
            Don&apos;t have Claude Code yet?{' '}
            <a href="https://claude.com/product/claude-code" target="_blank" rel="noopener">Install it first</a>{' '}
            then come back here. Or use the bash one-liner fallback:{' '}
            <code style={{ wordBreak: 'break-all' }}>{fallbackFor(detectPlatform())}</code>
          </p>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-dim)', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
