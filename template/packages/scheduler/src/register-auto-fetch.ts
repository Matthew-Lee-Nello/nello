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

import { createTask, listTasks } from '@nello/core'
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

const existing = listTasks(chatId).find(t => t.prompt === prompt && t.schedule === cron)
if (existing) {
  console.log(`Auto-fetch already registered as ${existing.id}`)
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
