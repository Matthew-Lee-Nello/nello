import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { listTasks, createTask, setTaskStatus, deleteTask, PROJECT_ROOT } from '@nello/core'
import { computeNextRun } from '@nello/scheduler'

export function cronRouter(): Router {
  const r = Router()

  r.get('/tasks', (req, res) => {
    const chatId = (req.query.chat_id as string) || undefined
    res.json(listTasks(chatId))
  })

  r.post('/tasks', (req, res) => {
    const { prompt, schedule, chat_id } = req.body ?? {}
    if (!prompt || !schedule || !chat_id) { res.status(400).json({ error: 'prompt, schedule, chat_id required' }); return }
    let next: number
    try { next = computeNextRun(schedule) } catch (err) {
      res.status(400).json({ error: `invalid cron: ${err instanceof Error ? err.message : err}` }); return
    }
    const id = randomUUID().slice(0, 8)
    createTask({ id, chat_id, prompt, schedule, next_run: next, status: 'active' })
    res.json({ id, next_run: next })
  })

  r.post('/tasks/:id/pause', (req, res) => { setTaskStatus(req.params.id, 'paused'); res.json({ ok: true }) })
  r.post('/tasks/:id/resume', (req, res) => { setTaskStatus(req.params.id, 'active'); res.json({ ok: true }) })
  r.delete('/tasks/:id', (req, res) => { deleteTask(req.params.id); res.json({ ok: true }) })

  // System cron: user crontab + any cron.d/*.sh scripts in PROJECT_ROOT.
  // Mac/Linux only — Windows returns empty + a flag so the UI can hide the section.
  r.get('/system', (_req, res) => {
    const isWindows = process.platform === 'win32'
    if (isWindows) {
      res.json({ crontab: '', cronScripts: [], platform: 'win32', supported: false })
      return
    }

    let crontab = ''
    try {
      crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
    } catch {
      crontab = '(no crontab entries)'
    }

    const cronDir = join(PROJECT_ROOT, 'cron.d')
    let cronScripts: Array<{ name: string; schedule: string; lastModified: string }> = []

    if (existsSync(cronDir)) {
      try {
        const files = readdirSync(cronDir).filter(f => f.endsWith('.sh'))
        cronScripts = files.map(f => {
          const fullPath = join(cronDir, f)
          const stat = statSync(fullPath)
          const content = readFileSync(fullPath, 'utf8')
          const scheduleMatch = content.match(/^#\s*Schedule:\s*(.+)$/m) || content.match(/^#\s*(\d+\s+\S+\s+\S+\s+\S+\s+\S+)/m)
          const schedule = scheduleMatch ? scheduleMatch[1].trim() : 'unknown'
          return { name: f, schedule, lastModified: stat.mtime.toISOString() }
        })
      } catch {
        // cron.d may not exist or be readable
      }
    }

    res.json({ crontab, cronScripts, platform: process.platform, supported: true })
  })

  return r
}
