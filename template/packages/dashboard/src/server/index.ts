import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DASHBOARD_PORT, logger, addLogTap } from '@nc/core'
import { chatRouter } from './routes/chat.js'
import { cronRouter } from './routes/cron.js'
import { monitoringRouter } from './routes/monitoring.js'
import { memoriesRouter } from './routes/memories.js'
import { daemonsRouter } from './routes/daemons.js'
import { subs, broadcastLog, type ClientSub } from './ws-broadcast.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface DashboardHandle {
  close: () => void
  port: number
}

// Re-export for any consumer that wants to push events from outside the routes.
export { sendToChat, broadcastLog } from './ws-broadcast.js'

// Loopback origins the dashboard frontend is allowed to come from. The CORS
// middleware uses this list to set headers; the same list backs the Origin
// guard below, which rejects state-changing requests from any other browser
// origin (e.g. evil.example pointing fetch() at http://localhost:3000).
const ALLOWED_DASHBOARD_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]

export function startDashboard(): DashboardHandle {
  const app = express()
  app.use(cors({ origin: ALLOWED_DASHBOARD_ORIGINS }))
  app.use(express.json({ limit: '200mb' }))

  // CSRF-by-Origin guard. CORS sets headers but the browser only enforces them
  // for cross-origin XHR fetches; HTML form POSTs and SSE/WS upgrades aren't
  // protected by CORS. This middleware refuses state-changing requests whose
  // Origin header is present and not in the allow-list. GET/HEAD/OPTIONS are
  // CSRF-safe per spec. Requests with no Origin (curl, server-to-server,
  // same-origin nav) pass through.
  app.use('/api/', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const origin = req.get('origin')
    if (!origin) return next()
    if (ALLOWED_DASHBOARD_ORIGINS.includes(origin)) return next()
    res.status(403).json({ error: 'origin not allowed' })
  })

  app.use('/api/chat', chatRouter())
  app.use('/api/cron', cronRouter())
  app.use('/api/monitoring', monitoringRouter())
  app.use('/api/memories', memoriesRouter())
  app.use('/api/daemons', daemonsRouter())

  const uiDir = join(__dirname, '..', 'ui')
  if (existsSync(uiDir)) {
    app.use(express.static(uiDir))
    app.get('*', (_req, res) => res.sendFile(join(uiDir, 'index.html')))
  }

  const server = createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    const sub: ClientSub = { ws, chatId: null, wantLogs: false }
    subs.add(sub)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg && typeof msg === 'object') {
          if (msg.type === 'subscribe' && typeof msg.chatId === 'string') sub.chatId = msg.chatId
          if (msg.type === 'subscribe-logs') sub.wantLogs = true
          if (msg.type === 'unsubscribe-logs') sub.wantLogs = false
        }
      } catch { /* ignore */ }
    })
    ws.on('close', () => { subs.delete(sub) })
  })

  // Tap pino so every log line streams to subscribed clients, but redact the
  // structured fields before broadcasting. Raw pino fields routinely include
  // stack traces, absolute paths, secret bodies in error objects, and other
  // metadata that should not land in any local browser tab that opens the
  // dashboard. Allow-list small, primitive identifiers and surface error
  // type only (not stack/path content).
  const SAFE_LOG_FIELDS = new Set(['chatId', 'attempt', 'port', 'code', 'status', 'id', 'count'])
  const removeTap = addLogTap((e) => {
    const safe: Record<string, unknown> = {}
    for (const k of SAFE_LOG_FIELDS) {
      const v = e.fields[k]
      if (v === undefined) continue
      const t = typeof v
      if (t === 'string' || t === 'number' || t === 'boolean') safe[k] = v
    }
    if (e.fields.err && typeof e.fields.err === 'object' && e.fields.err !== null) {
      const err = e.fields.err as { message?: unknown; name?: unknown }
      const m = typeof err.message === 'string' ? err.message : ''
      // First line only, length-capped, no stack and no file paths.
      safe.errType = (typeof err.name === 'string' ? err.name + ': ' : '') + m.split('\n')[0].slice(0, 120)
    }
    broadcastLog(e.level, e.msg, safe, e.ts)
  })

  let actualPort = DASHBOARD_PORT
  const MAX_ATTEMPTS = 5
  let attempts = 0

  const tryListen = (port: number): void => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempts < MAX_ATTEMPTS) {
        attempts++
        const next = port + 1
        logger.warn({ port, next, attempts }, 'port in use, trying next')
        actualPort = next
        tryListen(next)
      } else {
        logger.error({ err, port }, 'dashboard listen failed')
        throw err
      }
    })
    server.listen(port, () => {
      actualPort = port
      logger.info({ port }, 'Dashboard listening')
    })
  }
  tryListen(DASHBOARD_PORT)

  return {
    close: () => {
      removeTap()
      server.close()
    },
    get port() { return actualPort },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDashboard()
}
