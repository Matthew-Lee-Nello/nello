import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb, PROJECT_ROOT } from '@nello/core'

const started = Date.now()

// The VERSION this daemon BOOTED from, read once at process start. The self-update verify
// gate compares it to the version it just reset to: if a stale old-code daemon is still
// answering (restart didn't take), it reports the OLD version it loaded at its own start,
// and the gate fails instead of passing a daemon running the previous build.
const BUILD_VERSION = (() => {
  try { return readFileSync(join(PROJECT_ROOT, 'VERSION'), 'utf-8').trim() } catch { return undefined }
})()

export function monitoringRouter(): Router {
  const r = Router()

  r.get('/health', (_req, res) => {
    const mem = process.memoryUsage()
    res.json({
      status: 'ok',
      version: BUILD_VERSION,
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
