import { join } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { saveMemory, searchMemories, getRecentMemories, touchMemory, decayMemories, getDb, type Memory } from './db.js'
import { logger } from './logger.js'
import { VAULT_PATH, MEMORY_DELETE_THRESHOLD, MEMORY_DAILY_DECAY, MEMORY_ENGINE } from './config.js'
import { gbrainSearch } from './brain.js'

const SEMANTIC_PATTERNS = [
  /\b(my|i am|i'm|i prefer|remember|always|never)\b/i,
  /\b(i like|i don't like|i hate|i love)\b/i,
  /\b(my name is|call me|i work|i live)\b/i,
  /\b(my goal|my project|my business)\b/i,
]

function isSemanticContent(text: string): boolean {
  return SEMANTIC_PATTERNS.some(p => p.test(text))
}

/**
 * Build memory context to inject above the user's message.
 * Combines FTS keyword search + recent-access list + (when NC_MEMORY_ENGINE=gbrain)
 * gbrain semantic recall over the vault. Dedupes. Touches each.
 *
 * The gbrain block runs BEFORE the empty-conversation-memory early-return on
 * purpose: a brand-new client has no FTS rows yet (cold start) - exactly when
 * vault recall matters most - so returning early there would silently starve the
 * brain. gbrainSearch self-guards (hard timeout + silent []), so it never blocks.
 */
export async function buildMemoryContext(chatId: string, userMessage: string): Promise<string> {
  const seen = new Set<number>()
  const memories: Memory[] = []

  for (const mem of searchMemories(chatId, userMessage, 3)) {
    if (!seen.has(mem.id)) { memories.push(mem); seen.add(mem.id) }
  }

  for (const mem of getRecentMemories(chatId, 5)) {
    if (!seen.has(mem.id)) { memories.push(mem); seen.add(mem.id) }
  }

  // Semantic recall from the vault (gbrain). Off unless NC_MEMORY_ENGINE=gbrain
  // (bootstrap sets it only when an OPENAI_API_KEY is present). Never throws.
  let recall: string[] = []
  if (MEMORY_ENGINE === 'gbrain' && userMessage.trim().length > 2) {
    try {
      recall = await gbrainSearch(userMessage, 4, 3000)
    } catch (err) {
      logger.debug({ err }, 'gbrain recall failed (non-fatal)')
    }
  }

  if (memories.length === 0 && recall.length === 0) return ''

  for (const mem of memories) touchMemory(mem.id)

  const blocks: string[] = []
  if (memories.length > 0) {
    const lines = memories.map(m => `- ${m.content} (${m.sector})`).join('\n')
    blocks.push(`[Memory context]\n${lines}`)
  }
  if (recall.length > 0) {
    const lines = recall.map(r => `- ${r}`).join('\n')
    blocks.push(`[recall]\n${lines}`)
  }
  return blocks.join('\n') + '\n'
}

/**
 * Save a conversation turn.
 * Skip very short messages and commands. Route to semantic or episodic based on signals.
 */
export async function saveConversationTurn(chatId: string, userMsg: string, assistantMsg: string): Promise<void> {
  const combined = `User: ${userMsg}\nAssistant: ${assistantMsg}`

  if (userMsg.length <= 20) return
  if (userMsg.trim().startsWith('/')) return

  const sector: 'semantic' | 'episodic' = isSemanticContent(userMsg) ? 'semantic' : 'episodic'

  try {
    saveMemory(chatId, combined, sector)
    logger.debug({ chatId, sector, len: combined.length }, 'Memory saved')
  } catch (err) {
    logger.warn({ err }, 'Memory save failed')
  }
}

export { decayMemories } from './db.js'

// ---------- Daily snapshot ----------
//
// Memory at glance, written every day.  Lives inside the vault at
// `<VAULT>/Memory/Daily/YYYY-MM-DD.md` so it shows up in Obsidian alongside
// the auto-memory notes.  Captures counts, today's decay sweep, deletions,
// new memories, top semantic by salience.

const SNAPSHOTS_DIR = join(VAULT_PATH, 'Memory', 'Daily')

interface MemoryRow {
  id: number
  chat_id: string
  topic_key: string | null
  content: string
  sector: 'semantic' | 'episodic'
  salience: number
  created_at: number
  accessed_at: number
}

function listMemoriesAboutToDie(): MemoryRow[] {
  // Currently below threshold/0.98 will fall under threshold after the next
  // 0.98 multiplier and be deleted.  Capture them so the snapshot can list
  // what we are about to lose.
  const cutoff = MEMORY_DELETE_THRESHOLD / MEMORY_DAILY_DECAY
  return getDb().prepare(`
    SELECT id, chat_id, topic_key, content, sector, salience, created_at, accessed_at
    FROM memories WHERE salience < ?
    ORDER BY salience ASC LIMIT 200
  `).all(cutoff) as MemoryRow[]
}

interface SnapshotInputs {
  decayed: number
  deleted: number
  deletedSamples: MemoryRow[]
}

export function writeDailySnapshot(inputs: SnapshotInputs): string {
  mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const path = join(SNAPSHOTS_DIR, `${date}.md`)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartUnix = Math.floor(todayStart.getTime() / 1000)
  const probe = getDb().prepare('SELECT MAX(created_at) as m FROM memories').get() as { m: number | null }
  const isMillis = (probe.m ?? 0) > 1e12
  const todayThreshold = isMillis ? todayStart.getTime() : todayStartUnix

  const sectors = getDb().prepare(`
    SELECT sector, COUNT(*) as count, AVG(salience) as avg_salience, MIN(salience) as min_salience
    FROM memories GROUP BY sector
  `).all() as { sector: string; count: number; avg_salience: number; min_salience: number }[]
  const grand = (getDb().prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c

  const newToday = getDb().prepare(`
    SELECT id, chat_id, topic_key, content, sector, salience, created_at
    FROM memories WHERE created_at >= ?
    ORDER BY created_at DESC LIMIT 50
  `).all(todayThreshold) as MemoryRow[]

  const topSemantic = getDb().prepare(`
    SELECT id, chat_id, topic_key, content, sector, salience, created_at
    FROM memories WHERE sector = 'semantic'
    ORDER BY salience DESC LIMIT 20
  `).all() as MemoryRow[]

  const lines: string[] = []
  lines.push('---')
  lines.push(`date: ${date}`)
  lines.push('type: memory-snapshot')
  lines.push('tags: [memory, daily, snapshot]')
  lines.push(`total: ${grand}`)
  for (const s of sectors) lines.push(`${s.sector}: ${s.count}`)
  lines.push('---')
  lines.push('')
  lines.push(`# Memory snapshot ${date}`)
  lines.push('')
  lines.push('## Counts')
  lines.push(`- Total: **${grand}**`)
  for (const s of sectors) {
    lines.push(`- ${s.sector}: **${s.count}** (avg salience ${s.avg_salience.toFixed(3)}, min ${s.min_salience.toFixed(3)})`)
  }
  lines.push('')
  lines.push("## Today's decay sweep")
  lines.push(`- Salience multiplied by ${MEMORY_DAILY_DECAY} on **${inputs.decayed}** memories`)
  lines.push(`- Deleted **${inputs.deleted}** memories that fell below threshold ${MEMORY_DELETE_THRESHOLD}`)
  lines.push('')
  if (inputs.deletedSamples.length > 0) {
    lines.push('### Deleted (no longer in the database)')
    for (const m of inputs.deletedSamples.slice(0, 50)) {
      lines.push(`- \`#${m.id}\` *${m.sector}* ${m.salience.toFixed(3)} — ${truncate(m.content, 120)}`)
    }
    if (inputs.deletedSamples.length > 50) {
      lines.push(`- _+${inputs.deletedSamples.length - 50} more_`)
    }
    lines.push('')
  }
  if (newToday.length > 0) {
    lines.push('## Added today')
    for (const m of newToday) {
      lines.push(`- \`#${m.id}\` *${m.sector}* ${m.salience.toFixed(3)} — ${truncate(m.content, 200)}`)
    }
    lines.push('')
  }
  lines.push('## Top 20 semantic memories by salience')
  for (const m of topSemantic) {
    const topic = m.topic_key ? `[${m.topic_key}] ` : ''
    lines.push(`- \`#${m.id}\` ${m.salience.toFixed(3)} — ${topic}${truncate(m.content, 200)}`)
  }
  lines.push('')
  lines.push(`_Snapshot written ${new Date().toISOString()}._`)

  writeFileSync(path, lines.join('\n'))
  logger.info({ path, total: grand, newToday: newToday.length }, 'Daily memory snapshot written')
  return path
}

function truncate(s: string, n: number): string {
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function listSnapshots(): string[] {
  if (!existsSync(SNAPSHOTS_DIR)) return []
  return readdirSync(SNAPSHOTS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .map(f => f.replace(/\.md$/, ''))
}

export function readSnapshot(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const path = join(SNAPSHOTS_DIR, `${date}.md`)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}

/**
 * Combined daily decay sweep + snapshot.  Use this instead of decayMemories
 * directly so the snapshot always pairs with the sweep.
 */
export function runDecaySweep(): { decayed: number; deleted: number } {
  const aboutToDie = listMemoriesAboutToDie()
  const result = decayMemories()
  logger.info({ decayed: result.decayed, deleted: result.deleted }, 'Memory decay sweep completed')
  try {
    writeDailySnapshot({ decayed: result.decayed, deleted: result.deleted, deletedSamples: aboutToDie })
  } catch (err) {
    logger.warn({ err }, 'Daily snapshot write failed (non-fatal)')
  }
  return result
}
