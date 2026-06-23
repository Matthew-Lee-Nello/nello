/**
 * Shared slash-command core for every messaging surface (Telegram, WhatsApp).
 * Implemented ONCE here; each bot is a thin adapter.
 *
 *   /new      - start a fresh session: clear this chat's session + memory
 *               (snapshot first for undo). Supersedes the old session-only /newchat.
 *   /compact  - summarise the conversation, save it as a durable memory, then
 *               reset the context window so the next reply starts small but warm.
 *   /help     - list commands.
 *
 * SECURITY: these are destructive / cost-bearing. The CALLER must authorise the
 * sender (Telegram allowlist / WhatsApp owner-lock) BEFORE dispatching.
 */
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  clearSession,
  clearMemories,
  getMemoryCount,
  getChatMemories,
  deleteEpisodicMemories,
  saveMemory,
  type Memory,
} from './db.js'
import { summariseConversation, isSummariserAvailable } from './summarise.js'
import { PROJECT_ROOT } from './config.js'
import { logger } from './logger.js'

// Manual-command snapshots live in their own subdir so they never collide with
// any dated decay-sweep snapshot.
const SNAP_DIR = join(PROJECT_ROOT, 'memory', 'snapshots', 'manual')
const COMPACT_COOLDOWN_MS = 60_000
const MIN_TURNS_TO_COMPACT = 4
const lastCompactAt = new Map<string, number>()

function snapshot(kind: string, chatId: string, rows: Memory[]): void {
  if (rows.length === 0) return
  try {
    mkdirSync(SNAP_DIR, { recursive: true })
    const safe = chatId.replace(/[^\w.-]/g, '_')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const body = [
      `# ${kind} snapshot - ${chatId} - ${new Date().toISOString()}`,
      '',
      ...rows.map(r => `- [${r.sector}] ${r.content}`),
      '',
    ].join('\n')
    writeFileSync(join(SNAP_DIR, `${kind}-${safe}-${ts}.md`), body)
  } catch (err) {
    logger.warn({ err, chatId }, '[commands] snapshot write failed (non-fatal)')
  }
}

/**
 * /new - fresh session. Clears this chat's session + memory (a pre-wipe snapshot
 * is kept for undo).
 */
export async function cmdNew(chatId: string): Promise<string> {
  const before = getMemoryCount(chatId)
  snapshot('new', chatId, getChatMemories(chatId))
  clearSession(chatId)
  clearMemories(chatId)
  logger.info({ chatId, cleared: before }, '[commands] /new - fresh session')
  return before > 0
    ? `Fresh chat. New session started, ${before} memories from this chat cleared (snapshot kept).`
    : 'Fresh chat. New session started.'
}

/**
 * /compact - summarise the conversation, persist the summary as a retrievable
 * memory, trim the raw episodic turns, and reset the session so the next reply
 * starts on a small context window seeded by that summary.
 */
export async function cmdCompact(chatId: string): Promise<string> {
  const now = Date.now()
  const last = lastCompactAt.get(chatId) ?? 0
  if (now - last < COMPACT_COOLDOWN_MS) {
    return 'Just compacted - give it a minute before the next one.'
  }

  const all = getChatMemories(chatId)
  if (all.length < MIN_TURNS_TO_COMPACT) {
    return 'Nothing to compact yet - not enough conversation stored.'
  }
  if (!isSummariserAvailable()) {
    return 'Cannot compact: summariser not available on this install.'
  }

  // Claim the cooldown slot up front so a slow summarise can't be double-fired.
  lastCompactAt.set(chatId, now)

  const transcript = all.map(m => m.content).join('\n')
  let summary: string
  try {
    summary = await summariseConversation(transcript)
  } catch (err) {
    logger.warn({ err, chatId }, '[commands] /compact summarise failed')
    lastCompactAt.delete(chatId)
    return 'Compact failed: could not summarise. Nothing changed.'
  }

  // Snapshot the episodic chatter we are about to trim (undo + audit trail).
  snapshot('compact', chatId, getChatMemories(chatId, 'episodic'))

  // Persist the summary as a durable semantic memory.
  saveMemory(chatId, `[compact summary]\n${summary}`, 'semantic', 'compact-summary')

  // Trim the now-summarised raw turns + reset the session. The summary stays in
  // memory, so buildMemoryContext re-injects it next turn.
  const trimmed = deleteEpisodicMemories(chatId)
  clearSession(chatId)

  logger.info({ chatId, trimmed }, '[commands] /compact - summarised + reset')
  return `Compacted ${trimmed} turns into a summary. Fresh context window, continuity kept:\n\n${summary}`
}

const HELP = [
  'Commands:',
  '/new - start a fresh chat (new session, clears this chat\'s memory)',
  '/compact - summarise this conversation + reset the context window',
  '/help - show this',
].join('\n')

export function cmdHelp(): string {
  return HELP
}

/**
 * Surface-agnostic dispatcher. Returns a reply string if this was one of our
 * commands, or null if the text is not a command we own (caller continues its
 * normal message flow). The CALLER must have already authorised the sender.
 */
export async function handleSlashCommand(chatId: string, text: string): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const cmd = trimmed.slice(1).split(/\s+/)[0].toLowerCase()
  switch (cmd) {
    case 'new':
    case 'newchat':
    case 'forget':
      return cmdNew(chatId)
    case 'compact':
      return cmdCompact(chatId)
    case 'help':
      return cmdHelp()
    default:
      return null
  }
}
