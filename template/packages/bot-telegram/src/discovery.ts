/**
 * Telegram chat ID auto-discovery.
 *
 * Runs on first daemon start when ALLOWED_CHAT_ID is empty.
 * Polls Telegram getUpdates with the bot token. First incoming message captures chat.id.
 * Appends ALLOWED_CHAT_ID=<id> to .env, sends confirmation, exits.
 *
 * Caller (template/src/index.ts) is expected to restart the daemon after discovery so
 * the rest of the bot picks up the new chat ID via config.ts.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { TELEGRAM_BOT_TOKEN, PROJECT_ROOT, logger } from '@nello/core'

const POLL_TIMEOUT_S = 30
const MAX_WAIT_MS = 30 * 60 * 1000  // 30 min max

interface TelegramUpdate {
  update_id: number
  message?: { chat: { id: number; first_name?: string; username?: string }; text?: string }
}

async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=${POLL_TIMEOUT_S}&offset=${offset}&limit=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Telegram getUpdates ${res.status}`)
  const json = await res.json() as { ok: boolean; result: TelegramUpdate[] }
  if (!json.ok) throw new Error('Telegram getUpdates !ok')
  return json.result
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {})
}

function appendChatId(chatId: number): void {
  const envPath = join(PROJECT_ROOT, '.env')
  if (!existsSync(envPath)) return
  const current = readFileSync(envPath, 'utf-8')

  if (current.match(/^ALLOWED_CHAT_ID=.+$/m)) {
    // Replace existing line
    const updated = current.replace(/^ALLOWED_CHAT_ID=.*$/m, `ALLOWED_CHAT_ID=${chatId}`)
    writeFileSync(envPath, updated)
  } else {
    appendFileSync(envPath, `\nALLOWED_CHAT_ID=${chatId}\n`)
  }
}

/**
 * Run discovery. Returns the captured chatId, or null if timed out / no token.
 */
export async function discoverChatId(): Promise<number | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn('discovery: no TELEGRAM_BOT_TOKEN, skipping')
    return null
  }

  logger.info('discovery: waiting for first Telegram message to capture chat ID')

  const start = Date.now()
  let offset = 0

  while (Date.now() - start < MAX_WAIT_MS) {
    let updates: TelegramUpdate[] = []
    try {
      updates = await getUpdates(offset)
    } catch (err) {
      logger.warn({ err }, 'discovery: getUpdates failed, retrying in 5s')
      await new Promise(r => setTimeout(r, 5000))
      continue
    }

    for (const u of updates) {
      offset = u.update_id + 1
      if (u.message?.chat?.id) {
        const chatId = u.message.chat.id
        const name = u.message.chat.first_name || u.message.chat.username || 'there'
        logger.info({ chatId, name }, 'discovery: captured chat ID')
        appendChatId(chatId)
        await sendMessage(chatId, `Hi ${name}. I'm connected. Restarting now to load your config - one second.`)
        return chatId
      }
    }
  }

  logger.warn('discovery: timed out, no message received in 30 min')
  return null
}
