import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  generateMessageID,
  normalizeMessageContent,
  jidNormalizedUser,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { mkdirSync } from 'node:fs'
import {
  WHATSAPP_OWNER_NUMBER, WHATSAPP_SESSION_DIR, MAX_MESSAGE_LENGTH,
  getSession, setSession, clearSession,
  buildMemoryContext, saveConversationTurn,
  runAgent, logger,
} from '@nc/core'
import { formatForWhatsApp, splitMessage } from './format.js'

// Trailing invisible backup marker (U+2063 INVISIBLE SEPARATOR, zero-width). The
// PRIMARY echo guard is id-based (see reply()): we generate the message id, record
// it, THEN send - so the echo's key.id is already known and can never race ahead of
// us. This mark is only a secondary net in case an id ever differs. Trailing, not
// leading, so it can't disturb leading markdown and isn't on the edge WhatsApp is
// most likely to normalise.
const ECHO_MARK = '⁣'
// Keep sentIds from growing without bound if some echoes never arrive to clear them.
const SENT_IDS_CAP = 1000

export interface WhatsAppBot {
  start(): Promise<void>
  stop(): Promise<void>
  // Proactive send (scheduler / morning brief). Owner-locked, so the chatId is
  // ignored - delivery always goes to the owner's self-chat console.
  send(chatId: string, text: string): Promise<void>
}

/**
 * A local WhatsApp bot over Baileys (the unofficial WhatsApp Web protocol).
 *
 * Option A model: the bot links as a device on the owner's own number and the
 * owner's "Message Yourself" self-chat becomes the assistant console. Every message
 * in the self-chat (the owner's prompts AND the bot's own replies) is `fromMe`, so
 * to tell our own echo from a real prompt we PRE-GENERATE each reply's message id,
 * record it in sentIds, then send with that id - the echo's key.id is therefore
 * known before it can arrive, killing the loop with zero ordering race. A trailing
 * invisible sentinel + a start-time cutoff back it up. Inbound text is normalised
 * through Baileys so disappearing-messages / view-once / edited wrappers still
 * extract, and a single-flight queue serialises prompts so a second message arriving
 * mid-answer never starts a concurrent run or interleaves replies.
 */
export function createWhatsAppBot(opts: { ownerNumber?: string; sessionDir?: string } = {}): WhatsAppBot {
  const ownerNumber = (opts.ownerNumber ?? WHATSAPP_OWNER_NUMBER).replace(/[^0-9]/g, '')
  if (!ownerNumber) throw new Error('WHATSAPP_OWNER_NUMBER missing from .env')
  const sessionDir = opts.sessionDir ?? WHATSAPP_SESSION_DIR
  const ownerJid = `${ownerNumber}@s.whatsapp.net`
  const ownerJidN = jidNormalizedUser(ownerJid)
  let ownerLid = ''        // the owner's @lid identity - the self-chat often uses it
  let chatJid = ownerJid   // where replies go = the thread the owner messages from
  const sentIds = new Set<string>()
  const startedAt = Math.floor(Date.now() / 1000)
  const queue: WAMessage[] = []
  let processing = false

  let sock: WASocket | null = null
  let stopped = false
  let reconnectAttempts = 0

  function rememberSent(id: string): void {
    sentIds.add(id)
    if (sentIds.size > SENT_IDS_CAP) {
      // Drop the oldest ids (their echoes never came back to clear them).
      let drop = sentIds.size - SENT_IDS_CAP / 2
      for (const old of sentIds) { if (drop-- <= 0) break; sentIds.delete(old) }
    }
  }

  async function reply(text: string): Promise<void> {
    for (const chunk of splitMessage(formatForWhatsApp(text), MAX_MESSAGE_LENGTH)) {
      // Pre-generate the id and record it BEFORE sending: the echo's key.id is then
      // already in sentIds when it arrives, so the loop is broken with no race. The
      // trailing ECHO_MARK is a secondary net only.
      const messageId = generateMessageID()
      rememberSent(messageId)
      await sock?.sendMessage(chatJid, { text: chunk + ECHO_MARK }, { messageId })
    }
  }

  // Pull plain text out of any inbound message, unwrapping disappearing-messages /
  // view-once / edited wrappers first (Baileys normalize) and including captions, so
  // both real prompts and our own echoes extract regardless of the chat's mode.
  function messageText(m: WAMessage): string {
    const c = m.message ? normalizeMessageContent(m.message) : undefined
    return c?.conversation
      || c?.extendedTextMessage?.text
      || c?.imageMessage?.caption
      || c?.videoMessage?.caption
      || c?.documentMessage?.caption
      || ''
  }

  function handle(m: WAMessage): void {
    // Self-chat can arrive under the phone JID OR the owner's @lid identity (newer
    // multi-device addressing). Accept either; ignore anyone else.
    if (!ownerLid && sock?.user?.lid) ownerLid = jidNormalizedUser(sock.user.lid)
    const from = m.key.remoteJid ? jidNormalizedUser(m.key.remoteJid) : ''
    if (from !== ownerJidN && (!ownerLid || from !== ownerLid)) return
    // Reply back into whatever thread the owner is messaging from.
    chatJid = m.key.remoteJid || ownerJid

    // PRIMARY echo guard: our own replies carry an id we recorded before sending.
    // Drop them and free the id (keeps sentIds bounded on the happy path).
    if (m.key.id && sentIds.has(m.key.id)) { sentIds.delete(m.key.id); return }

    const text = messageText(m)
    // Secondary echo guard: trailing invisible sentinel, in case an id ever differs.
    if (text.includes(ECHO_MARK)) return
    // Ignore history replayed on (re)connect (offline 'append' batches include it).
    const ts = Number(m.messageTimestamp || 0)
    if (ts && ts < startedAt) return

    if (!text.trim()) return

    // Single-flight: queue the prompt and drain one at a time, in arrival order.
    queue.push(m)
    void drain()
  }

  // INVARIANT (do not break): handle() must enqueue synchronously (push before any
  // await), and drain() must have NO await between the empty-queue check and clearing
  // `processing`. That is what makes the queue lost-wakeup-free on a single thread.
  async function drain(): Promise<void> {
    if (processing) return
    processing = true
    try {
      while (queue.length) {
        const m = queue.shift()!
        await processMessage(messageText(m))
      }
    } finally {
      processing = false
    }
  }

  async function processMessage(text: string): Promise<void> {
    try {
      const memContext = await buildMemoryContext(ownerNumber, text)
      const message = memContext ? `${memContext}\n${text}` : text
      const sessionId = getSession(ownerNumber)
      await sock?.sendPresenceUpdate('composing', chatJid)
      const result = await runAgent(message, sessionId)
      if (result.newSessionId && result.newSessionId !== sessionId) {
        setSession(ownerNumber, result.newSessionId)
      }
      const out = result.text || '(no response)'
      await saveConversationTurn(ownerNumber, text, out)
      await reply(out)
    } catch (err) {
      logger.error({ err }, 'whatsapp handleMessage failed')
      // Drop the session so the next message starts fresh - never let one bad
      // (e.g. stale resume) turn wedge the conversation permanently.
      try { clearSession(ownerNumber) } catch { /* ignore */ }
      try { await reply(`Error: ${err instanceof Error ? err.message : String(err)}`) } catch {}
    }
  }

  async function connect(): Promise<void> {
    mkdirSync(sessionDir, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    // Pull the current WhatsApp Web version; a stale version fails the noise
    // handshake with "Connection Failure". Fall back to a recent pinned version
    // only if the live fetch is unreachable.
    let version: [number, number, number]
    try { ({ version } = await fetchLatestBaileysVersion()) }
    catch { version = [2, 3000, 1033893291] }
    // Canonical browser label + macOS platform path: WhatsApp rejects the pairing
    // request for non-standard browser strings and requires macOS for new links.
    sock = makeWASocket({ version, auth: state, browser: Browsers.macOS('Desktop') })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u
      if (qr) {
        logger.info('whatsapp: link a device - WhatsApp on your phone -> Settings -> Linked Devices -> Link a Device, then scan this:')
        qrcode.generate(qr, { small: true })
      }
      if (connection === 'open') { reconnectAttempts = 0; logger.info({ ownerNumber }, 'whatsapp connected') }
      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
        const loggedOut = code === DisconnectReason.loggedOut
        if (stopped || loggedOut) {
          logger.warn({ code }, loggedOut ? 'whatsapp logged out - re-link required, not reconnecting' : 'whatsapp stopped')
          return
        }
        // 515 (restartRequired) right after a successful pair is EXPECTED - reconnect
        // fast with the freshly saved creds, or WhatsApp invalidates the link.
        // Anything else: exponential backoff so we never hammer WhatsApp (rapid
        // reconnects trip its anti-abuse throttle and it refuses new device links).
        const restartRequired = code === DisconnectReason.restartRequired
        const delay = restartRequired ? 1000 : Math.min(60_000, 3_000 * 2 ** reconnectAttempts)
        reconnectAttempts++
        logger.warn({ code, delay, attempt: reconnectAttempts }, 'whatsapp connection closed, reconnecting')
        setTimeout(() => { connect().catch(err => logger.error({ err }, 'whatsapp reconnect failed')) }, delay)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      // 'notify' = live messages; 'append' = messages delivered while we were offline
      // (replayed on reconnect). Accept both - a prompt typed during the expected 515
      // reconnect arrives as 'append' and would otherwise be lost. The startedAt cutoff
      // in handle() drops the old history that 'append' also carries.
      if (type !== 'notify' && type !== 'append') return
      for (const m of messages) {
        try { handle(m) } catch (err) { logger.error({ err }, 'whatsapp upsert handler error') }
      }
    })
  }

  return {
    async start() { stopped = false; await connect() },
    async stop() {
      stopped = true
      try { sock?.end(undefined) } catch {}
      sock = null
    },
    // Owner-locked: chatId is ignored, reply() targets the owner's self-chat and
    // carries the same echo guard so a proactive message never re-enters as a prompt.
    async send(_chatId: string, text: string) { await reply(text) },
  }
}
