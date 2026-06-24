import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { STORE_DIR, SESSION_TTL_MS, MEMORY_DAILY_DECAY, MEMORY_DELETE_THRESHOLD, MEMORY_ACCESS_BOOST, MEMORY_MAX_SALIENCE } from './config.js'
import { logger } from './logger.js'

if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })

const DB_PATH = join(STORE_DIR, 'clawd.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  // Retry with backoff if the DB is locked (stale daemon, backup software, etc).
  // better-sqlite3's busy_timeout pragma handles transient locks within a single
  // call; this loop covers the open() itself in case the file is held exclusively.
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      _db = new Database(DB_PATH)
      _db.pragma('journal_mode = WAL')
      _db.pragma('foreign_keys = ON')
      _db.pragma('busy_timeout = 5000')  // wait up to 5s for transient locks
      initDatabase(_db)
      return _db
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!/SQLITE_BUSY|database is locked|cannot open/i.test(msg)) throw err
      const wait = (attempt + 1) * 1000
      logger.warn({ err: msg, attempt: attempt + 1, waitMs: wait }, 'SQLite locked, retrying')
      // Synchronous spin-wait so the rest of startup waits before continuing
      const until = Date.now() + wait
      while (Date.now() < until) { /* spin */ }
    }
  }
  logger.error({ err: lastErr }, 'failed to open SQLite after 4 attempts. Try: pkill -f "node.*nello-claw" then rerun')
  throw lastErr
}

export function initDatabase(db: Database.Database = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      topic_key TEXT,
      content TEXT NOT NULL,
      sector TEXT NOT NULL CHECK(sector IN ('semantic','episodic')),
      salience REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_chat ON memories(chat_id);
    CREATE INDEX IF NOT EXISTS idx_memories_sector ON memories(sector);
    CREATE INDEX IF NOT EXISTS idx_memories_salience ON memories(salience DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run INTEGER NOT NULL,
      last_run INTEGER,
      last_result TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON scheduled_tasks(status, next_run);
    -- Migration: claimed_at lease column. Added 2026-05 to atomically claim due
    -- tasks (UPDATE ... RETURNING) instead of read-then-update. Existing DBs
    -- get the column added below; new DBs would already have it after a
    -- future schema rev but we keep the ALTER for back-compat installs.

    CREATE TABLE IF NOT EXISTS dashboard_chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      session_id TEXT,
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','thinking','tool')),
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES dashboard_chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON dashboard_messages(chat_id, created_at);
  `)

  // Idempotent column add for the scheduled_tasks lease. better-sqlite3 throws
  // on duplicate column; swallow that specific case so initDatabase stays
  // safe to call on both fresh and upgraded DBs.
  try {
    db.exec('ALTER TABLE scheduled_tasks ADD COLUMN claimed_at INTEGER')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/duplicate column name/i.test(msg)) throw err
  }

  logger.info('Database initialised')
}

// ---------- Sessions ----------

export function getSession(chatId: string): string | undefined {
  const row = getDb().prepare('SELECT session_id, expires_at FROM sessions WHERE chat_id = ?').get(chatId) as { session_id: string, expires_at: number } | undefined
  if (!row) return undefined
  if (row.expires_at < Date.now()) {
    clearSession(chatId)
    return undefined
  }
  return row.session_id
}

export function setSession(chatId: string, sessionId: string): void {
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO sessions (chat_id, session_id, updated_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      session_id = excluded.session_id,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at
  `).run(chatId, sessionId, now, now + SESSION_TTL_MS)
}

export function clearSession(chatId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE chat_id = ?').run(chatId)
}

// ---------- Memory ----------

export interface Memory {
  id: number
  chat_id: string
  topic_key: string | null
  content: string
  sector: 'semantic' | 'episodic'
  salience: number
  created_at: number
  accessed_at: number
}

export function saveMemory(chatId: string, content: string, sector: 'semantic' | 'episodic', topicKey?: string): number {
  const now = Math.floor(Date.now() / 1000)
  const result = getDb().prepare(`
    INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at)
    VALUES (?, ?, ?, ?, 1.0, ?, ?)
  `).run(chatId, topicKey ?? null, content, sector, now, now)
  return result.lastInsertRowid as number
}

export function searchMemories(chatId: string, query: string, limit = 3): Memory[] {
  const sanitised = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(w => w.length > 2).map(w => `${w}*`).join(' OR ')
  if (!sanitised) return []
  try {
    return getDb().prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts fts ON fts.rowid = m.id
      WHERE m.chat_id = ? AND memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(chatId, sanitised, limit) as Memory[]
  } catch (e) {
    logger.warn({ err: e }, 'FTS search failed')
    return []
  }
}

export function getRecentMemories(chatId: string, limit = 5): Memory[] {
  return getDb().prepare(`
    SELECT * FROM memories WHERE chat_id = ?
    ORDER BY accessed_at DESC LIMIT ?
  `).all(chatId, limit) as Memory[]
}

export function touchMemory(id: number): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    UPDATE memories SET
      accessed_at = ?,
      salience = MIN(salience + ?, ?)
    WHERE id = ?
  `).run(now, MEMORY_ACCESS_BOOST, MEMORY_MAX_SALIENCE, id)
}

export function decayMemories(): { decayed: number; deleted: number } {
  const now = Math.floor(Date.now() / 1000)
  const dayAgo = now - 86400
  const decayed = getDb().prepare('UPDATE memories SET salience = salience * ? WHERE created_at < ?').run(MEMORY_DAILY_DECAY, dayAgo)
  const deleted = getDb().prepare('DELETE FROM memories WHERE salience < ?').run(MEMORY_DELETE_THRESHOLD)
  return { decayed: decayed.changes, deleted: deleted.changes }
}

export function clearMemories(chatId: string): number {
  return getDb().prepare('DELETE FROM memories WHERE chat_id = ?').run(chatId).changes
}

// All memories for a chat in chronological order (oldest first) - the transcript
// proxy used by /compact. Optionally filter by sector.
export function getChatMemories(chatId: string, sector?: 'semantic' | 'episodic'): Memory[] {
  if (sector) {
    return getDb().prepare(
      'SELECT * FROM memories WHERE chat_id = ? AND sector = ? ORDER BY created_at ASC'
    ).all(chatId, sector) as Memory[]
  }
  return getDb().prepare(
    'SELECT * FROM memories WHERE chat_id = ? ORDER BY created_at ASC'
  ).all(chatId) as Memory[]
}

// Count of memories stored for a chat (used in the /new confirmation).
export function getMemoryCount(chatId: string): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM memories WHERE chat_id = ?').get(chatId) as { c: number }
  return row.c
}

// Trim a chat's episodic turns (the raw chatter) after /compact has summarised
// them into a durable semantic memory. Returns the number of rows removed.
export function deleteEpisodicMemories(chatId: string): number {
  return getDb().prepare(
    "DELETE FROM memories WHERE chat_id = ? AND sector = 'episodic'"
  ).run(chatId).changes
}

// ---------- Scheduled tasks ----------

export interface Task {
  id: string
  chat_id: string
  prompt: string
  schedule: string
  next_run: number
  last_run: number | null
  last_result: string | null
  status: 'active' | 'paused'
  created_at: number
}

export function createTask(task: Omit<Task, 'last_run' | 'last_result' | 'created_at'>): void {
  getDb().prepare(`
    INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.chat_id, task.prompt, task.schedule, task.next_run, task.status, Math.floor(Date.now() / 1000))
}

export function getDueTasks(): Task[] {
  const now = Math.floor(Date.now() / 1000)
  return getDb().prepare(`
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run <= ?
  `).all(now) as Task[]
}

// Stale-claim threshold. If a process crashed mid-task, the lease can be
// re-claimed after this many seconds. Long enough to cover most legitimate
// long-running prompts, short enough that a dead daemon doesn't park a task
// forever.
const TASK_CLAIM_TTL_SECONDS = 60 * 60

// Atomically claim every due task in one statement. The previous read-then-
// update flow had two race windows: (a) two scheduler ticks (or two daemon
// processes) could both pick up the same row, and (b) a crash between the
// pre-run next_run bump and the actual runAgent() left the task permanently
// skipped. UPDATE ... RETURNING claims and reads in the same atomic write.
export function claimDueTasks(): Task[] {
  const now = Math.floor(Date.now() / 1000)
  const staleCutoff = now - TASK_CLAIM_TTL_SECONDS
  return getDb().prepare(`
    UPDATE scheduled_tasks
       SET claimed_at = ?, last_run = ?
     WHERE status = 'active'
       AND next_run <= ?
       AND (claimed_at IS NULL OR claimed_at < ?)
     RETURNING *
  `).all(now, now, now, staleCutoff) as Task[]
}

// Release a claim after the task body finishes (success or error). Bumps
// next_run and writes last_result. Does not touch status, so a /api/cron
// pause that arrived mid-run survives the release.
export function releaseTask(id: string, nextRun: number, result: string): void {
  getDb().prepare(`
    UPDATE scheduled_tasks
       SET next_run = ?, last_result = ?, claimed_at = NULL
     WHERE id = ?
  `).run(nextRun, result, id)
}

// On scheduler boot: surface and clear any stale claims left behind by a
// crashed prior process. Returns the number of rows released.
export function recoverStaleClaims(): number {
  const cutoff = Math.floor(Date.now() / 1000) - TASK_CLAIM_TTL_SECONDS
  const r = getDb().prepare(`
    UPDATE scheduled_tasks SET claimed_at = NULL
     WHERE claimed_at IS NOT NULL AND claimed_at < ?
  `).run(cutoff)
  return r.changes
}

export function updateTaskAfterRun(id: string, nextRun: number, result: string): void {
  const now = Math.floor(Date.now() / 1000)
  getDb().prepare(`
    UPDATE scheduled_tasks SET next_run = ?, last_run = ?, last_result = ? WHERE id = ?
  `).run(nextRun, now, result, id)
}

export function listTasks(chatId?: string): Task[] {
  if (chatId) {
    return getDb().prepare('SELECT * FROM scheduled_tasks WHERE chat_id = ? ORDER BY next_run ASC').all(chatId) as Task[]
  }
  return getDb().prepare('SELECT * FROM scheduled_tasks ORDER BY next_run ASC').all() as Task[]
}

export function setTaskStatus(id: string, status: 'active' | 'paused'): void {
  getDb().prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, id)
}

export function deleteTask(id: string): void {
  getDb().prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
}
