#!/usr/bin/env node
/**
 * Seed the default morning brief scheduled task.
 * Invoked by the installer bootstrap on first run if the user enabled it.
 *
 * Env required:
 *   MORNING_BRIEF_CRON     e.g. "0 9 * * *"
 *   MORNING_BRIEF_PROMPT   the prompt text
 *   ALLOWED_CHAT_ID        chat ID to deliver to
 */

import { createTask, listTasks } from '@nello/core'
import { computeNextRun } from './scheduler.js'
import { randomUUID } from 'node:crypto'

const cron = process.env.MORNING_BRIEF_CRON
const prompt = process.env.MORNING_BRIEF_PROMPT
const chatId = process.env.ALLOWED_CHAT_ID?.split(',')[0]?.trim()

if (!cron || !prompt || !chatId) {
  console.error('Missing MORNING_BRIEF_CRON, MORNING_BRIEF_PROMPT, or ALLOWED_CHAT_ID')
  process.exit(1)
}

// Skip if already seeded
const existing = listTasks(chatId).find(t => t.prompt === prompt && t.schedule === cron)
if (existing) {
  console.log(`Morning brief already registered as ${existing.id}`)
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
console.log(`Morning brief registered as ${id} (${cron})`)
