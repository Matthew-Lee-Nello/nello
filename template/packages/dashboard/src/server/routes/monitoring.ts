import { Router } from 'express'
import { getDb } from '@nello/core'

const started = Date.now()

export function monitoringRouter(): Router {
  const r = Router()

  r.get('/health', (_req, res) => {
    const mem = process.memoryUsage()
    res.json({
      status: 'ok',
      uptime_s: Math.floor((Date.now() - started) / 1000),
      uptime: Math.floor((Date.now() - started) / 1000),
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
      },
      timestamp: Date.now(),
    })
  })

  r.get('/stats', (_req, res) => {
    const mem = process.memoryUsage()
    const db = getDb()

    const memRows = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    const sessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c
    const tasks = (db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks').get() as { c: number }).c

    // Sector breakdown (semantic / episodic counts)
    const sectorRows = db.prepare(`
      SELECT sector, COUNT(*) as count, AVG(salience) as avg_salience, MIN(salience) as min_salience
      FROM memories
      GROUP BY sector
    `).all() as Array<{ sector: string; count: number; avg_salience: number; min_salience: number }>
    const semantic = sectorRows.find(s => s.sector === 'semantic')?.count ?? 0
    const episodic = sectorRows.find(s => s.sector === 'episodic')?.count ?? 0

    // Chat stats (active only)
    const chats = (db.prepare('SELECT COUNT(*) as c FROM dashboard_chats WHERE archived_at IS NULL').get() as { c: number }).c
    const messages = (db.prepare('SELECT COUNT(*) as c FROM dashboard_messages').get() as { c: number }).c

    res.json({
      uptime_s: Math.floor((Date.now() - started) / 1000),
      memory_mb: mem.rss / 1024 / 1024,
      memory_rows: memRows,
      sessions,
      scheduled_tasks: tasks,
      // expanded fields
      semantic,
      episodic,
      total_chats: chats,
      total_messages: messages,
      sectors: sectorRows,
    })
  })

  return r
}
