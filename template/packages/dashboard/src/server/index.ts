import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DASHBOARD_PORT, DASHBOARD_TOKEN, logger, addLogTap } from '@nc/core'
import { cronRouter } from './routes/cron.js'
import { monitoringRouter } from './routes/monitoring.js'
import { daemonsRouter } from './routes/daemons.js'
import { subs, broadcastLog, type ClientSub } from './ws-broadcast.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface DashboardHandle {
  close: () => void
  port: number
}

// Re-export for any consumer that wants to push events from outside the routes.
export { broadcastLog } from './ws-broadcast.js'

// Loopback origins the dashboard frontend is allowed to come from. The CORS
// middleware uses this list to set headers; the same list backs the Origin
// guard below, which rejects state-changing requests from any other browser
// origin (e.g. evil.example pointing fetch() at http://localhost:3000).
const ALLOWED_DASHBOARD_ORIGINS = [
  // Track the actual configured port, not a hardcoded 3000. A client install on
  // any other DASHBOARD_PORT (e.g. 3100) was getting 403 "origin not allowed" on
  // every POST because its own Origin wasn't in this list.
  `http://localhost:${DASHBOARD_PORT}`,
  `http://127.0.0.1:${DASHBOARD_PORT}`,
  'http://localhost:5173',   // vite dev server
  'http://127.0.0.1:5173',
]

// Pull the dashboard token out of an incoming request. Order of preference:
// Authorization: Bearer <t>, the x-dashboard-token header, a ?token=<t> query
// (used once to bootstrap the SPA from a link), then the nc_dash cookie.
function extractToken(req: { headers: Record<string, unknown>; query?: Record<string, unknown> }): string | null {
  const auth = req.headers['authorization']
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const hdr = req.headers['x-dashboard-token']
  if (typeof hdr === 'string' && hdr) return hdr.trim()
  const q = req.query?.['token']
  if (typeof q === 'string' && q) return q.trim()
  const cookie = req.headers['cookie']
  if (typeof cookie === 'string') {
    for (const part of cookie.split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === 'nc_dash') return decodeURIComponent(v.join('=')).trim()
    }
  }
  return null
}

// Constant-time-ish compare to avoid leaking length/byte timing. Both empty =
// caller's job to have rejected first; here a missing expected token means the
// gate is open (dev/legacy installs without a token in .env).
function tokenMatches(provided: string | null): boolean {
  if (!DASHBOARD_TOKEN) return true
  if (!provided || provided.length !== DASHBOARD_TOKEN.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ DASHBOARD_TOKEN.charCodeAt(i)
  return diff === 0
}

export function startDashboard(): DashboardHandle {
  const app = express()
  app.use(cors({ origin: ALLOWED_DASHBOARD_ORIGINS }))
  // 25mb is generous for any JSON body (file uploads go through multipart, not
  // here); 200mb was an unbounded-memory footgun. Per-message text is capped in
  // the chat route too.
  app.use(express.json({ limit: '25mb' }))

  // Token gate. Mounted BEFORE the API routers AND express.static so an
  // unauthed device gets 401 on both an API call and the SPA shell ('/'),
  // never a 200 + the app. Skipped entirely when DASHBOARD_TOKEN is empty
  // (dev / legacy installs). On a valid ?token= query we set an httpOnly
  // cookie so the SPA's subsequent asset + XHR loads pass without the query.
  if (DASHBOARD_TOKEN) {
    app.use((req, res, next) => {
      const provided = extractToken(req)
      if (!tokenMatches(provided)) {
        res.status(401).json({ error: 'unauthorised - append ?token=<your DASHBOARD_TOKEN> once' })
        return
      }
      // Promote a valid query token to a cookie so reloads/asset fetches work.
      if (typeof req.query?.['token'] === 'string' && req.query['token']) {
        res.setHeader('Set-Cookie', `nc_dash=${encodeURIComponent(String(req.query['token']))}; HttpOnly; SameSite=Strict; Path=/`)
      }
      next()
    })
  }

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

  // v1.0: chat + memory routes retired (chat -> Telegram, memory -> the vault).
  // What survives: cron (the Scheduled Tasks tab), monitoring (the Monitor tab +
  // the /api/monitoring/health gate the self-update verify step polls), and
  // daemons (the sidebar Telegram-status badge).
  app.use('/api/cron', cronRouter())
  app.use('/api/monitoring', monitoringRouter())
  app.use('/api/daemons', daemonsRouter())

  const uiDir = join(__dirname, '..', 'ui')
  if (existsSync(uiDir)) {
    app.use(express.static(uiDir))
    app.get('*', (_req, res) => res.sendFile(join(uiDir, 'index.html')))
  }

  const server = createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  // Gate the WS upgrade with the same token. The ws library hands us the raw
  // upgrade request; reuse extractToken (Authorization header / cookie /
  // ?token= on the ws:// URL). Without this the chat WebSocket would be an
  // unauthed channel into the bypassPermissions agent.
  wss.on('connection', (ws, req) => {
    if (DASHBOARD_TOKEN) {
      const url = new URL(req.url || '/', 'http://localhost')
      const provided = extractToken({
        headers: req.headers as Record<string, unknown>,
        query: { token: url.searchParams.get('token') ?? undefined },
      })
      if (!tokenMatches(provided)) {
        try { ws.close(1008, 'unauthorised') } catch { /* ignore */ }
        return
      }
    }
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
      // First line only, secrets/URLs/long-tokens scrubbed before it streams to
      // any subscribed browser tab.
      const firstLine = m.split('\n')[0].slice(0, 200)
        .replace(/(bearer\s+\S+|sk-\S+|ak_\S+|https?:\/\/\S+|[A-Za-z0-9_-]{32,})/gi, '[redacted]')
      safe.errType = (typeof err.name === 'string' ? err.name + ': ' : '') + firstLine.slice(0, 120)
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
        // Non-fatal: keep the daemon (and the messaging bots) alive even if the
        // web UI can't bind - better than killing everything or, worse, running
        // while pretending to be healthy. Logged loudly so server.log +
        // install-doctor surface it.
        logger.error({ err, port }, `dashboard could not bind a port (tried ${DASHBOARD_PORT}-${port}); web UI disabled, bots still running. Free the port or set DASHBOARD_PORT and restart.`)
      }
    })
    // Bind to loopback only. The daemon + dashboard chat route run with
    // bypassPermissions, so a 0.0.0.0 bind exposed RCE to the LAN. Tailscale
    // serve still reaches the dashboard by proxying from the tailnet into
    // 127.0.0.1, gated by the token middleware above.
    server.listen(port, '127.0.0.1', () => {
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
