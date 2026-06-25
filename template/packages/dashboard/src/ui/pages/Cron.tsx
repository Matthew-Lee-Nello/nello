import React, { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'

interface Task {
  id: string
  chat_id: string
  prompt: string
  schedule: string
  next_run: number
  status: 'active' | 'paused'
}

interface SystemCron {
  crontab: string
  cronScripts: Array<{ name: string; schedule: string; lastModified: string }>
  platform: string
  supported: boolean
}

function fmtNext(ts: number): string {
  if (!ts) return '—'
  const ms = (ts > 1e12 ? ts : ts * 1000) - Date.now()
  if (ms < 0) return 'overdue'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `in ${d}d`
}

export default function Cron() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [systemCron, setSystemCron] = useState<SystemCron | null>(null)
  const [search, setSearch] = useState('')

  const load = () => fetch('/api/cron/tasks').then(r => r.json()).then(setTasks).catch(() => {})
  const loadSystemCron = () => fetch('/api/cron/system').then(r => r.json()).then(setSystemCron).catch(() => {})

  useEffect(() => {
    load()
    loadSystemCron()
  }, [])

  const toggle = async (t: Task) => {
    await fetch(`/api/cron/tasks/${t.id}/${t.status === 'active' ? 'pause' : 'resume'}`, { method: 'POST' })
    load()
  }

  const del = async (t: Task) => {
    if (!confirm(`Delete task ${t.id}?`)) return
    await fetch(`/api/cron/tasks/${t.id}`, { method: 'DELETE' })
    load()
  }

  const filtered = search.trim()
    ? tasks.filter(t =>
        t.prompt.toLowerCase().includes(search.toLowerCase()) ||
        t.schedule.includes(search) ||
        t.id.includes(search))
    : tasks

  const active = tasks.filter(t => t.status === 'active').length
  const paused = tasks.filter(t => t.status === 'paused').length

  return (
    <>
      <div className="page-head">
        <div className="page-crumbs">
          <Icon name="clock" size={13} />
          <span>Schedules</span>
          <span className="sep">/</span>
          <span className="dim">cron</span>
        </div>
        <div className="page-actions">
          <div className="search">
            <Icon name="search" className="icon" />
            <input
              className="input"
              placeholder="Search schedules…"
              style={{ width: 220 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats strip */}
        <div style={{ padding: '16px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div className="stat">
            <div className="stat-label">Active</div>
            <div className="stat-value">{active}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Paused</div>
            <div className="stat-value">{paused}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total</div>
            <div className="stat-value">{tasks.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Next run</div>
            <div className="stat-value mono" style={{ fontSize: 16 }}>
              {tasks.length > 0
                ? fmtNext(Math.min(...tasks.filter(t => t.status === 'active').map(t => t.next_run)))
                : '—'}
            </div>
          </div>
        </div>

        {/* Nello tasks */}
        <div className="mon-section" style={{ paddingTop: 16 }}>
          <h3>Nello tasks</h3>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }} />
                <th>Prompt</th>
                <th style={{ width: 180 }}>Expression</th>
                <th style={{ width: 140 }}>Next run</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 110, textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                    {tasks.length === 0
                      ? 'No tasks. Create one via: nc-schedule create "prompt" "0 9 * * *" CHAT_ID'
                      : 'No matches.'}
                  </td>
                </tr>
              )}
              {filtered.map(t => (
                <tr key={t.id}>
                  <td>
                    <span className={`dot sm ${t.status === 'active' ? 'green' : 'amber'}`} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.prompt.slice(0, 100)}{t.prompt.length > 100 ? '…' : ''}
                    </div>
                    <div className="cron-meta">id {t.id.slice(0, 8)} · chat {t.chat_id}</div>
                  </td>
                  <td><span className="cron-expr">{t.schedule}</span></td>
                  <td className="cell-mono">{fmtNext(t.next_run)}</td>
                  <td>
                    <span className={`spill ${t.status === 'active' ? 'green' : 'amber'}`}>
                      <span className={`dot sm ${t.status === 'active' ? 'green' : 'amber'}`} />
                      {t.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-icon btn-ghost"
                        onClick={() => toggle(t)}
                        title={t.status === 'active' ? 'Pause' : 'Resume'}
                      >
                        <Icon name={t.status === 'active' ? 'pause' : 'play'} size={13} />
                      </button>
                      <button
                        className="btn btn-icon btn-ghost"
                        onClick={() => del(t)}
                        title="Delete"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* System cron section */}
        {systemCron?.supported && (systemCron.cronScripts.length > 0 || systemCron.crontab.trim()) && (
          <>
            {systemCron.cronScripts.length > 0 && (
              <div className="mon-section">
                <h3>System cron ({systemCron.platform})</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Script</th>
                      <th style={{ width: 180 }}>Schedule</th>
                      <th style={{ width: 160 }}>Last modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemCron.cronScripts.map(script => (
                      <tr key={script.name}>
                        <td className="mono" style={{ fontSize: 11 }}>{script.name}</td>
                        <td><span className="cron-expr">{script.schedule}</span></td>
                        <td className="cell-mono">{new Date(script.lastModified).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {systemCron.crontab.trim() && (
              <div className="mon-section">
                <h3>Raw crontab</h3>
                <pre className="log-block" style={{ whiteSpace: 'pre-wrap' }}>{systemCron.crontab}</pre>
              </div>
            )}
          </>
        )}
        {systemCron && !systemCron.supported && (
          <div className="mon-section">
            <div className="callout">
              <Icon name="info" />
              <div>
                <strong>System cron unavailable</strong>
                <br />
                Reading the user crontab isn't supported on {systemCron.platform}. Nello schedules above run regardless.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
