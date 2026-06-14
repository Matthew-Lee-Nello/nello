import { Bot, type Context } from 'grammy'
import {
  ALLOWED_CHAT_IDS, TELEGRAM_BOT_TOKEN, MAX_MESSAGE_LENGTH,
  getSession, setSession, clearSession,
  buildMemoryContext, saveConversationTurn,
  runAgent,
  logger,
} from '@nc/core'
import { formatForTelegram, splitMessage } from './format.js'

type VoiceTranscriber = (filePath: string) => Promise<string>
type SpeechSynthesiser = (text: string) => Promise<Buffer>

export interface BotDeps {
  transcribeAudio?: VoiceTranscriber
  synthesizeSpeech?: SpeechSynthesiser
  downloadMedia?: (fileId: string, originalName?: string) => Promise<string>
}

/**
 * Create a Telegram bot.
 * deps.transcribeAudio + synthesizeSpeech are optional - provided by voice-online or voice-local packages.
 */
export function createBot(deps: BotDeps = {}): Bot {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN missing from .env')
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN)
  const voiceMode = new Set<string>()   // chat IDs with voice reply enabled

  function isAuthorised(chatId: number | string): boolean {
    const id = String(chatId)
    // Fail-closed: an empty allowlist denies everyone. On a client box the
    // installer pre-writes ALLOWED_CHAT_ID, so the list is never empty in
    // practice; if it somehow is, we must NOT trust the first sender.
    if (ALLOWED_CHAT_IDS.length === 0) return false
    return ALLOWED_CHAT_IDS.includes(id)
  }

  async function handleMessage(ctx: Context, rawText: string, forceVoiceReply = false): Promise<void> {
    const chatId = String(ctx.chat?.id ?? '')
    if (!isAuthorised(chatId)) {
      await ctx.reply(`Chat ID ${chatId} not authorised. Add it to ALLOWED_CHAT_ID in .env.`)
      return
    }

    const memContext = await buildMemoryContext(chatId, rawText)
    const message = memContext ? `${memContext}\n${rawText}` : rawText

    const sessionId = getSession(chatId)

    let typingTimer: NodeJS.Timeout | undefined
    try {
      await ctx.replyWithChatAction('typing')
      typingTimer = setInterval(() => {
        ctx.replyWithChatAction('typing').catch(() => {})
      }, 4000)

      const result = await runAgent(message, sessionId)

      if (result.newSessionId && result.newSessionId !== sessionId) {
        setSession(chatId, result.newSessionId)
      }

      const reply = result.text || '(no response)'
      await saveConversationTurn(chatId, rawText, reply)

      const wantsVoice = (forceVoiceReply || voiceMode.has(chatId)) && deps.synthesizeSpeech
      if (wantsVoice && deps.synthesizeSpeech) {
        try {
          const audio = await deps.synthesizeSpeech(reply)
          await ctx.replyWithVoice(new (await import('grammy')).InputFile(audio, 'reply.mp3'))
          return
        } catch (err) {
          logger.warn({ err }, 'TTS failed, falling back to text')
        }
      }

      const formatted = formatForTelegram(reply)
      for (const chunk of splitMessage(formatted, MAX_MESSAGE_LENGTH)) {
        await ctx.reply(chunk, { parse_mode: 'HTML' })
      }
    } catch (err) {
      logger.error({ err }, 'handleMessage failed')
      await ctx.reply(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (typingTimer) clearInterval(typingTimer)
    }
  }

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'there'
    await ctx.reply(`Hi ${name}. I'm ready. Send /chatid if you haven't locked auth yet.`)
  })

  bot.command('chatid', async (ctx) => {
    await ctx.reply(`Your chat ID: ${ctx.chat?.id}`)
  })

  bot.command('newchat', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    clearSession(chatId)
    await ctx.reply('Session cleared. Fresh context next message.')
  })

  bot.command('voice', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    if (voiceMode.has(chatId)) {
      voiceMode.delete(chatId)
      await ctx.reply('Voice replies: off.')
    } else {
      voiceMode.add(chatId)
      await ctx.reply('Voice replies: on.')
    }
  })

  bot.on('message:text', async (ctx) => {
    await handleMessage(ctx, ctx.message.text)
  })

  bot.on('message:voice', async (ctx) => {
    if (!deps.transcribeAudio || !deps.downloadMedia) {
      await ctx.reply('Voice transcription not installed.')
      return
    }
    await ctx.replyWithChatAction('typing')
    const localPath = await deps.downloadMedia(ctx.message.voice.file_id, 'voice.ogg')
    const transcript = await deps.transcribeAudio(localPath)
    await handleMessage(ctx, `[Voice transcribed]: ${transcript}`, true)
  })

  bot.on('message:photo', async (ctx) => {
    if (!deps.downloadMedia) {
      await ctx.reply('Media download not installed.')
      return
    }
    const photo = ctx.message.photo[ctx.message.photo.length - 1]
    const localPath = await deps.downloadMedia(photo.file_id, 'photo.jpg')
    const caption = ctx.message.caption ? `\nUser caption: ${ctx.message.caption}` : ''
    await handleMessage(ctx, `[User sent a photo at ${localPath}]${caption}`)
  })

  bot.on('message:document', async (ctx) => {
    if (!deps.downloadMedia) {
      await ctx.reply('Media download not installed.')
      return
    }
    const doc = ctx.message.document
    const localPath = await deps.downloadMedia(doc.file_id, doc.file_name)
    const caption = ctx.message.caption ? `\nUser caption: ${ctx.message.caption}` : ''
    await handleMessage(ctx, `[User sent document ${doc.file_name ?? 'file'} at ${localPath}]${caption}`)
  })

  bot.catch(err => {
    logger.error({ err }, 'Bot error')
  })

  return bot
}
