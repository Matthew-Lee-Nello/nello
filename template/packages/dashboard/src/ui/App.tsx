import React, { useEffect, useState, useRef } from 'react'
import Chat from './pages/Chat'
import Cron from './pages/Cron'
import Monitoring from './pages/Monitoring'
import Memory from './pages/Memory'
import DaemonStatus from './components/DaemonStatus'
import { Icon, type IconName } from './components/Icon'
import { ThemeToggle } from './components/ThemeToggle'

type Page = 'monitoring' | 'chat' | 'memory' | 'schedules'

const STORAGE_KEY = 'nc-last-page'
const VALID: Page[] = ['monitoring', 'chat', 'memory', 'schedules']

const NAV: { id: Page; label: string; icon: IconName }[] = [
  { id: 'monitoring', label: 'Monitor', icon: 'activity' },
  { id: 'chat', label: 'Chat', icon: 'message' },
  { id: 'memory', label: 'Memory', icon: 'database' },
  { id: 'schedules', label: 'Schedules', icon: 'clock' },
]

function initialPage(): Page {
  if (typeof window === 'undefined') return 'monitoring'
  const stored = localStorage.getItem(STORAGE_KEY) as Page | null
  if (stored === ('cron' as Page)) return 'schedules'
  if (stored === ('courses' as Page)) return 'monitoring'
  return stored && VALID.includes(stored) ? stored : 'monitoring'
}

function useWs(): boolean {
  const [open, setOpen] = useState(false)
  const ref = useRef<WebSocket | null>(null)

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (stopped) return
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
        ref.current = ws
        ws.onopen = () => setOpen(true)
        ws.onclose = () => {
          setOpen(false)
          if (!stopped) retry = setTimeout(connect, 3000)
        }
        ws.onerror = () => { try { ws.close() } catch {} }
      } catch {
        if (!stopped) retry = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      try { ref.current?.close() } catch {}
    }
  }, [])

  return open
}

export default function App() {
  const [page, setPage] = useState<Page>(initialPage)
  const wsConnected = useWs()

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, page) } catch {}
  }, [page])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sb-banner">
          <img src="/nello-labs-banner.png" alt="NELLO Labs" />
        </div>

        <div
          style={{
            padding: '6px 16px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--muted)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
          title={wsConnected ? 'Live socket connected' : 'Socket disconnected'}
        >
          <span
            className="dot sm"
            style={{
              background: wsConnected ? 'var(--green)' : 'var(--red)',
              marginRight: 6,
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
          />
          <span>ws · {wsConnected ? 'live' : 'down'}</span>
          <ThemeToggle />
        </div>

        <div className="sb-section-label">Workspace</div>
        <nav className="sb-nav">
          {NAV.map((it) => (
            <button
              key={it.id}
              className={`sb-nav-item ${page === it.id ? 'active' : ''}`}
              onClick={() => setPage(it.id)}
            >
              <Icon name={it.icon} className="nav-icon" />
              <span>{it.label}</span>
            </button>
          ))}
        </nav>

        <div className="sb-spacer" />
        <DaemonStatus />
      </aside>

      <main className="main">
        {page === 'monitoring' && <Monitoring />}
        {page === 'chat' && <Chat />}
        {page === 'memory' && <Memory />}
        {page === 'schedules' && <Cron />}
      </main>
    </div>
  )
}
