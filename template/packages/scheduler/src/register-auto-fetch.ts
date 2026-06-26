#!/usr/bin/env node
/**
 * Seed the default auto-fetch scheduled task.
 *
 * One global tick every 20 minutes (configurable). The agent walks each
 * active MCP connection (Gmail, Calendar, Drive, etc), uses @nello/core dedup
 * + @nello/vault-seeder provenance to write new items into vault/Inbox.md, and
 * posts a one-line summary to the chat so the user sees the system breathing.
 *
 * Invoked by the installer bootstrap on first run if enableAutoFetch is true.
 *
 * Env required:
 *   AUTO_FETCH_CRON     e.g. "* /20 * * * *"
 *   ALLOWED_CHAT_ID     chat ID to deliver the per-tick one-liner to
 *
 * Optional:
 *   AUTO_FETCH_PROMPT   override the default prompt (otherwise uses the
 *                        canonical "run /auto-fetch" instruction below)
 */

import { createTask, listTasks, deleteTask, getMeta } from '@nello/core'
import { computeNextRun } from './scheduler.js'
import { randomUUID } from 'node:crypto'

const DEFAULT_PROMPT = `Run /auto-fetch.

Walk every active MCP connection (Gmail, Calendar, Drive, Slack if connected). For each new item since the last tick:

1. Classify against the dedup index — skip if unchanged, write fresh markdown if new/updated.
2. Write into vault/Inbox/auto-fetch/<source>/<source_id>.md with provenance frontmatter (source, source_id, toolkit, scope, time_range, fetched_at, content_hash).
3. Append a one-line entry to vault/Inbox.md: "- [HH:MM] <source>: <short summary> → [[Inbox/auto-fetch/<source>/<source_id>]]".

When done, reply with one line: "Auto-fetch: <N> new, <M> updated, <S> skipped across <K> sources." Nothing else.`

const cron = process.env.AUTO_FETCH_CRON
const chatId = process.env.ALLOWED_CHAT_ID?.split(',')[0]?.trim()
const prompt = process.env.AUTO_FETCH_PROMPT || DEFAULT_PROMPT

if (!cron || !chatId) {
  console.error('Missing AUTO_FETCH_CRON or ALLOWED_CHAT_ID')
  process.exit(1)
}

// Canonical single auto-fetch task. Match EVERY auto-fetch task for this chat (any
// era - they all run "/auto-fetch"), not an exact prompt+schedule pair. The old
// exact-match dedup let a stale row survive (e.g. an ancient */10 cron that kept
// scraping email and burning the API) AND stacked a second task beside it on every
// update. Converge to exactly one canonical task no matter what the preserved store
// carried in.
const AUTO_FETCH_SIGNATURE = '/auto-fetch'
const existing = listTasks(chatId).filter(t => t.prompt.includes(AUTO_FETCH_SIGNATURE))

// Durable opt-out: `nello autofetch off` writes a DB tombstone that outlives both a
// deleted bundle.json and a deleted task row. If the owner turned auto-fetch off and
// then deleted the row (dashboard delete, not the supported `off`), an /update re-seed
// would otherwise resurrect it. Honour the tombstone: clean up any stragglers, seed nothing.
try {
  if (getMeta('autofetch_optout') === '1') {
    for (const t of existing) { deleteTask(t.id); console.log(`Removed auto-fetch task ${t.id} (owner opted out)`) }
    console.log('Auto-fetch is opted out (`nello autofetch off`); not seeding. Run `nello autofetch on` to resume.')
    process.exit(0)
  }
} catch { /* no db / fresh install — fall through to normal seeding */ }

// Respect an explicit opt-out. If the owner paused auto-fetch (dashboard or
// `nello autofetch off`), don't resurrect it - keep one paused row, drop any dupes.
const paused = existing.find(t => t.status === 'paused')
if (paused) {
  for (const t of existing) if (t.id !== paused.id) { deleteTask(t.id); console.log(`Removed duplicate auto-fetch task ${t.id} (${t.schedule})`) }
  console.log(`Auto-fetch is paused (${paused.id}); leaving it off. Run \`nello autofetch on\` to resume.`)
  process.exit(0)
}

// No pause: keep at most the one matching the current canonical prompt+cron, delete
// the rest (stale schedules, duplicates, retired prompts).
const canonical = existing.find(t => t.prompt === prompt && t.schedule === cron)
for (const t of existing) {
  if (canonical && t.id === canonical.id) continue
  deleteTask(t.id)
  console.log(`Removed stale/duplicate auto-fetch task ${t.id} (${t.schedule})`)
}
if (canonical) {
  console.log(`Auto-fetch already registered as ${canonical.id} (${cron})`)
  process.exit(0)
}

const id = randomUUID().slice(0, 8)
createTask({
  id,
  chat_id: chatId,
  prompt,
  schedule: cron,
  next_run: computeNextRun(cron),
  status: 'active',
})
console.log(`Auto-fetch registered as ${id} (${cron})`)
