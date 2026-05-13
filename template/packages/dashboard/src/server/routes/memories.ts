import { Router } from 'express'
import { getDb, MEMORY_DELETE_THRESHOLD, MEMORY_DAILY_DECAY, listSnapshots, readSnapshot, writeDailySnapshot, logger } from '@nc/core'

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

// Coerce + clamp salience. Rejects NaN/Infinity/negatives instead of letting
// them flow into the decay logic, which treats salience as a finite [0,1]
// probability. Previously `Number(salience)` happily produced NaN from
// arbitrary JSON, and `typeof updates.salience === 'number'` accepted
// Number.POSITIVE_INFINITY through to PATCH.
function clampSalience(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 1) return null
  return n
}

export function memoriesRouter(): Router {
  const r = Router()

  // GET /api/memories - list with optional FTS search + sector filter + pagination
  r.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim()
    // Whitelist sector — never pass through query-string values into SQL.
    const sectorRaw = String(req.query.sector ?? 'all')
    const sector: 'semantic' | 'episodic' | 'all' =
      sectorRaw === 'semantic' || sectorRaw === 'episodic' ? sectorRaw : 'all'
    const chatId = req.query.chatId ? String(req.query.chatId) : undefined
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100)))
    const offset = Math.max(0, Number(req.query.offset ?? 0))

    const where: string[] = []
    const params: (string | number)[] = []
    if (sector !== 'all') { where.push('m.sector = ?'); params.push(sector) }
    if (chatId) { where.push('m.chat_id = ?'); params.push(chatId) }

    let sql: string
    if (q) {
      where.push('memories_fts MATCH ?')
      params.push(q)
      sql = `
        SELECT m.id, m.chat_id, m.topic_key, m.content, m.sector, m.salience, m.created_at, m.accessed_at
        FROM memories m
        JOIN memories_fts f ON m.id = f.rowid
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY bm25(memories_fts)
        LIMIT ? OFFSET ?
      `
    } else {
      sql = `
        SELECT id, chat_id, topic_key, content, sector, salience, created_at, accessed_at
        FROM memories m
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `
    }
    params.push(limit, offset)

    try {
      const rows = getDb().prepare(sql).all(...params) as MemoryRow[]
      // Parameterise sector in the total count too. The previous string-concat
      // form let `?sector=x' OR 1=1 --` break out of the SQL string. The
      // sectorRaw whitelist above blocks that case, but parameterising removes
      // the whole class so future changes can't reintroduce it.
      const total = sector === 'all'
        ? (getDb().prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
        : (getDb().prepare('SELECT COUNT(*) as c FROM memories WHERE sector = ?').get(sector) as { c: number }).c
      res.json({ memories: rows, total, limit, offset })
    } catch (err) {
      logger.error({ err }, 'memories list failed')
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/memories/stats
  r.get('/stats', (_req, res) => {
    const totals = getDb().prepare(`
      SELECT sector, COUNT(*) as count, AVG(salience) as avg_salience, MIN(salience) as min_salience
      FROM memories GROUP BY sector
    `).all() as { sector: string; count: number; avg_salience: number; min_salience: number }[]
    const grand = (getDb().prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    res.json({
      total: grand,
      sectors: totals,
      decayRate: MEMORY_DAILY_DECAY,
      deleteThreshold: MEMORY_DELETE_THRESHOLD,
    })
  })

  // GET /api/memories/snapshots - list snapshot dates
  r.get('/snapshots', (_req, res) => {
    res.json({ dates: listSnapshots() })
  })

  // POST /api/memories/snapshots - manually trigger a snapshot
  r.post('/snapshots', (_req, res) => {
    try {
      const path = writeDailySnapshot({ decayed: 0, deleted: 0, deletedSamples: [] })
      res.json({ path, date: new Date().toISOString().slice(0, 10) })
    } catch (err) {
      logger.error({ err }, 'manual snapshot failed')
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /api/memories/snapshots/:date - read one snapshot's markdown
  r.get('/snapshots/:date', (req, res) => {
    const md = readSnapshot(req.params.date)
    if (md == null) { res.status(404).json({ error: 'snapshot not found' }); return }
    res.type('text/markdown').send(md)
  })

  // GET /api/memories/decay-preview - what next sweep would delete
  r.get('/decay-preview', (_req, res) => {
    const cutoff = MEMORY_DELETE_THRESHOLD / MEMORY_DAILY_DECAY
    const doomed = getDb().prepare(`
      SELECT id, chat_id, topic_key, content, sector, salience, created_at
      FROM memories WHERE salience < ?
      ORDER BY salience ASC
      LIMIT 100
    `).all(cutoff) as MemoryRow[]
    const count = (getDb().prepare('SELECT COUNT(*) as c FROM memories WHERE salience < ?').get(cutoff) as { c: number }).c
    res.json({ cutoff, count, sample: doomed })
  })

  // POST /api/memories - manually pin a new memory
  r.post('/', (req, res) => {
    const { chat_id, content, sector = 'semantic', salience = 1.0, topic_key } = req.body ?? {}
    if (!chat_id || !content) { res.status(400).json({ error: 'chat_id + content required' }); return }
    if (sector !== 'semantic' && sector !== 'episodic') { res.status(400).json({ error: 'invalid sector' }); return }
    const salienceClamped = clampSalience(salience)
    if (salienceClamped === null) { res.status(400).json({ error: 'salience must be a finite number in [0, 1]' }); return }
    const now = Math.floor(Date.now() / 1000)
    try {
      const result = getDb().prepare(`
        INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(chat_id, topic_key ?? null, content, sector, salienceClamped, now, now)
      const row = getDb().prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid) as MemoryRow
      res.json(row)
    } catch (err) {
      logger.error({ err }, 'memories insert failed')
      res.status(500).json({ error: String(err) })
    }
  })

  // PATCH /api/memories/:id
  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'invalid id' }); return }
    const updates = req.body ?? {}
    const existing = getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
    if (!existing) { res.status(404).json({ error: 'not found' }); return }

    const fields: string[] = []
    const values: (string | number | null)[] = []
    if (typeof updates.content === 'string') { fields.push('content = ?'); values.push(updates.content) }
    if (updates.sector === 'semantic' || updates.sector === 'episodic') { fields.push('sector = ?'); values.push(updates.sector) }
    if (updates.salience !== undefined) {
      const s = clampSalience(updates.salience)
      if (s === null) { res.status(400).json({ error: 'salience must be a finite number in [0, 1]' }); return }
      fields.push('salience = ?'); values.push(s)
    }
    if (updates.topic_key !== undefined) { fields.push('topic_key = ?'); values.push(updates.topic_key) }
    if (fields.length === 0) { res.json(existing); return }

    fields.push('accessed_at = ?'); values.push(Math.floor(Date.now() / 1000))
    values.push(id)
    try {
      getDb().prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      const row = getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow
      res.json(row)
    } catch (err) {
      logger.error({ err, id }, 'memories update failed')
      res.status(500).json({ error: String(err) })
    }
  })

  // DELETE /api/memories/:id
  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'invalid id' }); return }
    try {
      const result = getDb().prepare('DELETE FROM memories WHERE id = ?').run(id)
      if (result.changes === 0) { res.status(404).json({ error: 'not found' }); return }
      res.json({ deleted: true, id })
    } catch (err) {
      logger.error({ err, id }, 'memories delete failed')
      res.status(500).json({ error: String(err) })
    }
  })

  return r
}
