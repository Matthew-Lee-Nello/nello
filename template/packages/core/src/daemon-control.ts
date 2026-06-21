/**
 * Daemon control singleton - tracks Telegram bot lifecycle so the dashboard
 * can show running/paused state and pause/resume from the UI.
 *
 * The bot itself is owned by template/src/index.ts. This module just holds
 * the runtime flags and the bot reference. The restart loop in index.ts
 * checks isTelegramPaused() before each polling attempt.
 */

import { logger } from './logger.js'
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_IDS, WHATSAPP_OWNER_NUMBER } from './config.js'

// Structural type so we don't drag grammy into @nc/core.
// The real bot instance is passed in by template/src/index.ts.
interface BotLike {
  stop(): Promise<void>
  api: { getMe(): Promise<{ username?: string }> }
}

interface TelegramRuntime {
  bot: BotLike | null
  running: boolean
  paused: boolean
  lastError: string | null
  username: string | null
}

const tg: TelegramRuntime = { bot: null, running: false, paused: false, lastError: null, username: null }

// ----- Telegram -----

export function registerTelegramBot(bot: BotLike): void {
  tg.bot = bot
  bot.api.getMe().then((me: { username?: string }) => { tg.username = me.username ?? null }).catch(() => {})
}

export function setTelegramRunning(running: boolean): void { tg.running = running }
export function setTelegramError(err: string | null): void { tg.lastError = err }
export function isTelegramPaused(): boolean { return tg.paused }

export async function pauseTelegram(): Promise<void> {
  tg.paused = true
  if (tg.bot && tg.running) {
    try {
      await tg.bot.stop()
      logger.info('[daemon-control] Telegram bot stopped via pause request')
    } catch (err) {
      logger.warn({ err }, '[daemon-control] Telegram stop failed')
    }
  }
}

export function resumeTelegram(): void {
  tg.paused = false
  tg.lastError = null
  logger.info('[daemon-control] Telegram resume requested')
}

export function getTelegramState() {
  return {
    configured: !!TELEGRAM_BOT_TOKEN,
    chatIdConfigured: ALLOWED_CHAT_IDS.length > 0,
    running: tg.running,
    paused: tg.paused,
    lastError: tg.lastError,
    username: tg.username,
  }
}

// ----- WhatsApp (Baileys) -----
// Structural type so we don't drag baileys into @nc/core. The real bot (with its
// own internal reconnect) is passed in by template/src/index.ts.
interface WaLike {
  stop(): Promise<void>
}

interface WhatsAppRuntime {
  bot: WaLike | null
  running: boolean
  paused: boolean
  lastError: string | null
}

const wa: WhatsAppRuntime = { bot: null, running: false, paused: false, lastError: null }

export function registerWhatsAppBot(bot: WaLike): void { wa.bot = bot }
export function setWhatsAppRunning(running: boolean): void { wa.running = running }
export function setWhatsAppError(err: string | null): void { wa.lastError = err }
export function isWhatsAppPaused(): boolean { return wa.paused }

export async function pauseWhatsApp(): Promise<void> {
  wa.paused = true
  if (wa.bot && wa.running) {
    try {
      await wa.bot.stop()
      logger.info('[daemon-control] WhatsApp bot stopped via pause request')
    } catch (err) {
      logger.warn({ err }, '[daemon-control] WhatsApp stop failed')
    }
  }
}

export function resumeWhatsApp(): void {
  wa.paused = false
  wa.lastError = null
  logger.info('[daemon-control] WhatsApp resume requested')
}

export function getWhatsAppState() {
  return {
    configured: !!WHATSAPP_OWNER_NUMBER,
    running: wa.running,
    paused: wa.paused,
    lastError: wa.lastError,
  }
}
