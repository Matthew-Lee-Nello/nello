import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from '../components/Icon'

interface ChatRow {
  id: string
  name: string
  session_id: string | null
  archived_at: number | null
  created_at: number
  updated_at: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

const ACTIVE_KEY = 'nc-dashboard-chat-id'

const SLASH_COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: '/newchat', desc: 'Start a brand new chat' },
  { cmd: '/clear', desc: 'Clear this chat\'s session memory' },
  { cmd: '/help', desc: 'Show available commands' },
]

function relTime(ts: number | null): string {
  if (!ts) return ''
  const ms = Date.now() - (ts > 1e12 ? ts : ts * 1000)
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function Chat() {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [archivedChats, setArchivedChats] = useState<ChatRow[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({})
  const [streamingByChat, setStreamingByChat] = useState<Record<string, string>>({}) // chat -> partial assistant text
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pendingFiles, setPendingFiles] = useState<Array<{ name: string; saved: string; size: number }>>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showCmds, setShowCmds] = useState(false)
  const [cmdIdx, setCmdIdx] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Initial load -----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = (await fetch('/api/chat').then(r => r.json())) as ChatRow[]
        if (cancelled) return
        if (list.length === 0) {
          const created = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Dashboard' }),
          }).then(r => r.json())
          if (cancelled) return
          setChats([{ ...created, session_id: null, archived_at: null, created_at: Date.now(), updated_at: Date.now() }])
          setActiveId(created.id)
          localStorage.setItem(ACTIVE_KEY, created.id)
        } else {
          setChats(list)
          const stored = localStorage.getItem(ACTIVE_KEY)
          const pick = stored && list.find(c => c.id === stored) ? stored : list[0].id
          setActiveId(pick)
          localStorage.setItem(ACTIVE_KEY, pick)
        }
      } catch (err) {
        if (!cancelled) setError(`Couldn't reach the daemon: ${String(err)}`)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ---- WS subscription -----
  useEffect(() => {
    if (!activeId) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', chatId: activeId }))
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.chatId !== activeId) return
        if (msg.type === 'thinking') {
          setBusy(true)
        } else if (msg.type === 'text' && msg.data?.text) {
          setStreamingByChat(prev => ({
            ...prev,
            [activeId]: (prev[activeId] || '') + msg.data.text,
          }))
        } else if (msg.type === 'message_done') {
          setStreamingByChat(prev => ({ ...prev, [activeId]: '' }))
          setMessagesByChat(prev => ({
            ...prev,
            [activeId]: [...(prev[activeId] || []), { role: 'assistant', content: msg.data?.reply ?? '' }],
          }))
          setBusy(false)
        } else if (msg.type === 'error') {
          setError(msg.data?.error || 'Daemon error')
          setBusy(false)
          setStreamingByChat(prev => ({ ...prev, [activeId]: '' }))
        }
      } catch { /* ignore */ }
    }
    ws.onclose = () => { wsRef.current = null }
    return () => { try { ws.close() } catch {} }
  }, [activeId])

  // ---- Load messages on chat change -----
  useEffect(() => {
    if (!activeId) return
    if (messagesByChat[activeId]) return
    fetch(`/api/chat/${activeId}/messages`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ role: string; content: string; created_at: number }>) => {
        setMessagesByChat(prev => ({
          ...prev,
          [activeId]: rows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content, ts: r.created_at })),
        }))
      })
      .catch(() => {})
  }, [activeId, messagesByChat])

  // ---- Auto-scroll -----
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeId, messagesByChat, streamingByChat, busy])

  // ---- Focus rename input -----
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  const reloadChats = useCallback(async () => {
    const list = (await fetch('/api/chat').then(r => r.json())) as ChatRow[]
    setChats(list)
  }, [])

  const reloadArchived = useCallback(async () => {
    const list = (await fetch('/api/chat/archived/list').then(r => r.json())) as ChatRow[]
    setArchivedChats(list)
  }, [])

  const newChat = useCallback(async () => {
    try {
      const created = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New chat' }),
      }).then(r => r.json())
      await reloadChats()
      setActiveId(created.id)
      localStorage.setItem(ACTIVE_KEY, created.id)
      setInput('')
      setShowArchived(false)
    } catch (err) {
      setError(`Couldn't create chat: ${String(err)}`)
    }
  }, [reloadChats])

  const switchTo = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(ACTIVE_KEY, id)
    setError('')
  }, [])

  const archive = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Archive this chat?')) return
    await fetch(`/api/chat/${id}`, { method: 'DELETE' })
    await reloadChats()
    if (activeId === id) {
      const next = chats.find(c => c.id !== id)?.id ?? null
      setActiveId(next)
      if (next) localStorage.setItem(ACTIVE_KEY, next)
      else localStorage.removeItem(ACTIVE_KEY)
    }
  }, [activeId, chats, reloadChats])

  const restore = useCallback(async (id: string) => {
    await fetch(`/api/chat/${id}/restore`, { method: 'POST' })
    await reloadChats()
    await reloadArchived()
  }, [reloadChats, reloadArchived])

  const purge = useCallback(async (id: string) => {
    if (!confirm('Permanently delete this chat? Cannot be undone.')) return
    await fetch(`/api/chat/${id}/permanent`, { method: 'DELETE' })
    await reloadArchived()
  }, [reloadArchived])

  const startRename = useCallback((c: ChatRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(c.id)
    setEditName(c.name)
  }, [])

  const saveRename = useCallback(async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return }
    await fetch(`/api/chat/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    })
    setEditingId(null)
    await reloadChats()
  }, [editName, reloadChats])

  // ---- Uploads -----
  const uploadFiles = useCallback(async (files: File[]) => {
    if (!activeId || files.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const res = await fetch(`/api/chat/${activeId}/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const { files: meta } = await res.json() as { files: Array<{ name: string; saved: string; size: number }> }
      setPendingFiles(prev => [...prev, ...meta])
    } catch (err) {
      setError(`Upload failed: ${String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [activeId])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) uploadFiles(files)
  }, [uploadFiles])

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) uploadFiles(files)
    e.target.value = ''
  }, [uploadFiles])

  // ---- Send -----
  const send = async () => {
    const text = input.trim()
    if (!text || !activeId || busy) return

    // Slash command intercepts
    if (text.startsWith('/')) {
      if (text === '/newchat') { setInput(''); newChat(); return }
      if (text === '/clear') {
        setInput('')
        await fetch(`/api/chat/${activeId}/clear`, { method: 'POST' })
        setMessagesByChat(prev => ({ ...prev, [activeId]: [] }))
        return
      }
      if (text === '/help') {
        setInput('')
        setMessagesByChat(prev => ({
          ...prev,
          [activeId]: [
            ...(prev[activeId] || []),
            { role: 'assistant', content: `Available commands:\n${SLASH_COMMANDS.map(c => `- \`${c.cmd}\` ${c.desc}`).join('\n')}` },
          ],
        }))
        return
      }
    }

    // Build payload — include uploaded file refs if any
    let payload = text
    if (pendingFiles.length > 0) {
      const fileList = pendingFiles.map(f => `- ${f.name} (${(f.size / 1024).toFixed(1)} KB) at ${f.saved}`).join('\n')
      payload = `${text}\n\n[Attached files]\n${fileList}`
    }

    setInput('')
    setShowCmds(false)
    setError('')
    setMessagesByChat(prev => ({
      ...prev,
      [activeId]: [...(prev[activeId] || []), { role: 'user', content: payload }],
    }))
    setStreamingByChat(prev => ({ ...prev, [activeId]: '' }))
    setBusy(true)
    setPendingFiles([])

    try {
      const res = await fetch(`/api/chat/${activeId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload }),
      })
      if (!res.ok) {
        const data = await res.json()
        const why = data?.error || `HTTP ${res.status}`
        setMessagesByChat(prev => ({
          ...prev,
          [activeId]: [...(prev[activeId] || []), { role: 'assistant', content: `⚠ Daemon error: ${why}` }],
        }))
        setError(`Daemon error: ${why}`)
        setBusy(false)
      }
      // success path is driven by WS message_done event (above)
    } catch (err) {
      setMessagesByChat(prev => ({
        ...prev,
        [activeId]: [...(prev[activeId] || []), { role: 'assistant', content: `⚠ Network error: ${String(err)}` }],
      }))
      setError(`Network error talking to the daemon. Is it running?`)
      setBusy(false)
    }
  }

  // ---- Slash command keyboard handling -----
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCmds) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIdx(i => Math.min(i + 1, filteredCmds.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && filteredCmds[cmdIdx]) {
        e.preventDefault()
        setInput(filteredCmds[cmdIdx].cmd + ' ')
        setShowCmds(false)
        return
      }
      if (e.key === 'Escape') { setShowCmds(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const onInputChange = (v: string) => {
    setInput(v)
    if (v.startsWith('/') && !v.includes(' ')) {
      setShowCmds(true)
      setCmdIdx(0)
    } else {
      setShowCmds(false)
    }
  }

  const messages = activeId ? (messagesByChat[activeId] || []) : []
  const streaming = activeId ? streamingByChat[activeId] || '' : ''
  const activeChat = chats.find(c => c.id === activeId)
  const filteredChats = search.trim()
    ? chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : chats
  const filteredCmds = SLASH_COMMANDS.filter(c => c.cmd.startsWith(input.trim()) || input.trim() === '/')
  const subtitle = busy ? 'thinking…' : (activeChat?.name ?? '')
  const subtitleDot = busy ? 'amber pulse' : 'green'

  // Effect to load archived list when toggle flips on
  useEffect(() => {
    if (showArchived) reloadArchived()
  }, [showArchived, reloadArchived])

  return (
    <div className="chat-layout">
      <div className="chat-list">
        <div className="chat-list-head">
          <button className="btn btn-primary" onClick={newChat} style={{ justifyContent: 'center', height: 30 }}>
            <Icon name="plus" size={13} /> New chat
          </button>
          <div className="search">
            <Icon name="search" className="icon" />
            <input
              className="input"
              placeholder="Search chats…"
              style={{ height: 28 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="segmented" style={{ height: 24 }}>
            <button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Active</button>
            <button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>Archived</button>
          </div>
        </div>
        <div className="chat-list-body">
          {!showArchived && filteredChats.map(c => (
            <div
              key={c.id}
              className={`chat-row ${c.id === activeId ? 'active' : ''}`}
              onClick={() => switchTo(c.id)}
            >
              <div className="cr-text">
                {editingId === c.id ? (
                  <input
                    ref={editInputRef}
                    className="cell-edit-input"
                    style={{ fontSize: 12 }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveRename(c.id)
                      else if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => saveRename(c.id)}
                  />
                ) : (
                  <>
                    <div className="cr-title">{c.name}</div>
                    <div className="cr-snippet">chat · {(messagesByChat[c.id]?.length ?? 0)} msgs</div>
                  </>
                )}
              </div>
              <div className="cr-actions">
                <button
                  className="btn btn-icon btn-ghost"
                  style={{ width: 22, height: 22 }}
                  onClick={e => startRename(c, e)}
                  title="Rename"
                >
                  <Icon name="edit" size={11} />
                </button>
                <button
                  className="btn btn-icon btn-ghost"
                  style={{ width: 22, height: 22 }}
                  onClick={e => archive(c.id, e)}
                  title="Delete (archive — restore from Archived tab)"
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            </div>
          ))}
          {showArchived && archivedChats.map(c => (
            <div
              key={c.id}
              className="chat-row"
              style={{ opacity: 0.7 }}
            >
              <div className="cr-text">
                <div className="cr-title">{c.name}</div>
                <div className="cr-snippet">archived · {relTime(c.archived_at)}</div>
              </div>
              <div className="row-actions" style={{ opacity: 1, display: 'inline-flex', gap: 2 }}>
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={() => restore(c.id)}
                  title="Restore"
                >
                  <Icon name="check" size={12} />
                </button>
                <button
                  className="btn btn-icon btn-destructive"
                  onClick={() => purge(c.id)}
                  title="Permanent delete"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          ))}
          {!showArchived && filteredChats.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div className="empty-text">No chats {search ? 'match' : 'yet'}.</div>
            </div>
          )}
          {showArchived && archivedChats.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              <div className="empty-text">No archived chats.</div>
            </div>
          )}
        </div>
      </div>

      <div
        className="chat-pane"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={dragOver ? { boxShadow: 'inset 0 0 0 2px var(--accent-border)' } : undefined}
      >
        {activeChat && (
          <div className="chat-header">
            <div className="avatar">L</div>
            <div className="col" style={{ gap: 1 }}>
              <div className="ch-name">Luke</div>
              <div className="ch-sub">
                <span className={`dot sm ${subtitleDot}`} />
                {subtitle}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }} className="row gap-12">
              <span className="muted-text mono" style={{ fontSize: 10 }}>
                {messages.length} messages · claude
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="toast error" style={{ margin: '12px 24px 0' }}>
            <Icon name="alert" className="icon" />
            <span>{error}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setError('')}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        )}

        <div className="chat-messages">
          {!activeId && (
            <div className="empty" style={{ height: 'auto', padding: 60 }}>
              <div className="empty-mark"><Icon name="message" size={20} /></div>
              <div className="empty-title">No chat selected</div>
              <div className="empty-text">Click + New chat in the sidebar to start.</div>
            </div>
          )}
          {messages.length === 0 && activeId && !busy && !streaming && (
            <div className="empty" style={{ height: 'auto', padding: 60 }}>
              <div className="empty-mark"><Icon name="sparkle" size={20} /></div>
              <div className="empty-title">Ask anything</div>
              <div className="empty-text">Bypass permissions on. Memory shared with your Telegram bot and terminal Claude Code.</div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' && <div className="avatar sm">L</div>}
              <div>
                <div className="bubble">
                  {m.role === 'assistant'
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    : m.content}
                </div>
                <div className="meta">{m.role === 'user' ? 'you' : 'Luke'}</div>
              </div>
              {m.role === 'user' && <div className="avatar sm user">You</div>}
            </div>
          ))}

          {streaming && (
            <div className="msg assistant">
              <div className="avatar sm">L</div>
              <div>
                <div className="bubble">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                </div>
                <div className="meta">Luke · streaming…</div>
              </div>
            </div>
          )}

          {busy && !streaming && (
            <div className="msg assistant">
              <div className="avatar sm">L</div>
              <div className="bubble typing"><span className="typing-text">thinking</span></div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="composer" style={{ position: 'relative' }}>
          {showCmds && filteredCmds.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% - 4px)',
                left: 80,
                right: 80,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 4,
                zIndex: 5,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {filteredCmds.map((c, i) => (
                <div
                  key={c.cmd}
                  onClick={() => { setInput(c.cmd + ' '); setShowCmds(false) }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    background: i === cmdIdx ? 'var(--accent-soft)' : 'transparent',
                    fontSize: 12,
                  }}
                >
                  <span className="mono" style={{ color: 'var(--accent)' }}>{c.cmd}</span>
                  <span className="muted-text" style={{ marginLeft: 8, fontSize: 11 }}>{c.desc}</span>
                </div>
              ))}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '0 0 8px 0',
                flexWrap: 'wrap',
              }}
            >
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  className="tag-pill"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  title={`${f.size} bytes`}
                >
                  <Icon name="paperclip" size={10} />
                  {f.name}
                  <button
                    className="btn btn-ghost"
                    style={{ height: 14, padding: '0 2px', marginLeft: 4 }}
                    onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                  >
                    <Icon name="x" size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="composer-box">
            <textarea
              rows={2}
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={busy ? 'thinking…' : (uploading ? 'uploading…' : 'Reply to Luke… (drag-drop files, type / for commands)')}
              disabled={busy || !activeId}
            />
            <div className="composer-row">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={onPickFile}
              />
              <button
                className="btn btn-icon btn-ghost"
                title="Attach files"
                disabled={!activeId || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="paperclip" size={13} />
              </button>
              <span className="composer-hint">⏎ to send · ⇧⏎ for newline · / for commands</span>
              <div className="grow" />
              <button
                className="btn btn-primary btn-sm"
                onClick={send}
                disabled={busy || !input.trim() || !activeId}
              >
                <Icon name="send" size={12} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
