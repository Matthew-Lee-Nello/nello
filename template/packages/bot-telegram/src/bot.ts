import { Bot, type Context } from 'grammy'
import {
  ALLOWED_CHAT_IDS, TELEGRAM_BOT_TOKEN, MAX_MESSAGE_LENGTH,
  getSession, setSession,
  buildMemoryContext, saveConversationTurn,
  runAgent, cmdNew, cmdCompact, cmdHelp,
  logger, ingestAttachment,
} from '@nello/core'
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

  // Register the command menu so /new + /compact appear in Telegram's UI.
  bot.api.setMyCommands([
    { command: 'new', description: 'Start a fresh chat (new session, clears this chat memory)' },
    { command: 'compact', description: 'Summarise this conversation + reset context' },
    { command: 'voice', description: 'Toggle voice replies' },
    { command: 'chatid', description: 'Show your chat ID' },
    { command: 'help', description: 'List commands' },
  ]).catch((err: unknown) => logger.warn({ err }, 'setMyCommands failed (non-fatal)'))

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

  // /new - canonical fresh-chat command. Gated (destructive memory wipe).
  bot.command('new', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    if (!isAuthorised(chatId)) { await ctx.reply('Not authorised.'); return }
    await ctx.reply(await cmdNew(chatId))
  })

  // /newchat - alias of /new (was session-only + ungated; now full + gated).
  bot.command('newchat', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    if (!isAuthorised(chatId)) { await ctx.reply('Not authorised.'); return }
    await ctx.reply(await cmdNew(chatId))
  })

  // /compact - summarise the conversation + reset the context window. Gated.
  bot.command('compact', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    if (!isAuthorised(chatId)) { await ctx.reply('Not authorised.'); return }
    await ctx.reply(await cmdCompact(chatId))
  })

  // /help - list commands.
  bot.command('help', async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '')
    if (!isAuthorised(chatId)) { await ctx.reply('Not authorised.'); return }
    await ctx.reply(cmdHelp())
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

  // One path for every media kind: download → file into the vault (transcribing
  // voice) → hand the agent a fragment. Mirrors the WhatsApp side via the shared
  // ingestAttachment in @nello/core.
  async function ingestAndHandle(
    ctx: Context,
    fileId: string,
    meta: { mime: string; filename?: string; isPtt?: boolean; caption?: string },
  ): Promise<void> {
    if (!deps.downloadMedia) { await ctx.reply('Media download is not wired on this install.'); return }
    try {
      await ctx.replyWithChatAction('typing')
      const localPath = await deps.downloadMedia(fileId, meta.filename)
      const ing = await ingestAttachment({
        channel: 'telegram', chatId: String(ctx.chat?.id ?? ''), filePath: localPath,
        mime: meta.mime, filename: meta.filename, caption: meta.caption,
        isPtt: meta.isPtt, transcribe: deps.transcribeAudio,
      })
      await handleMessage(ctx, ing.promptFragment, meta.isPtt === true)
    } catch (err) {
      logger.error({ err }, 'telegram media ingest failed')
      await ctx.reply(`Couldn't process that file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  bot.on('message:voice', async (ctx) => {
    await ingestAndHandle(ctx, ctx.message.voice.file_id, {
      mime: ctx.message.voice.mime_type || 'audio/ogg', filename: 'voice.ogg', isPtt: true,
    })
  })

  bot.on('message:audio', async (ctx) => {
    const a = ctx.message.audio
    await ingestAndHandle(ctx, a.file_id, {
      mime: a.mime_type || 'audio/mpeg', filename: a.file_name || 'audio.mp3', caption: ctx.message.caption,
    })
  })

  bot.on('message:photo', async (ctx) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]
    await ingestAndHandle(ctx, photo.file_id, {
      mime: 'image/jpeg', filename: 'photo.jpg', caption: ctx.message.caption,
    })
  })

  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document
    await ingestAndHandle(ctx, doc.file_id, {
      mime: doc.mime_type || 'application/octet-stream', filename: doc.file_name, caption: ctx.message.caption,
    })
  })

  bot.on('message:video', async (ctx) => {
    await ingestAndHandle(ctx, ctx.message.video.file_id, {
      mime: ctx.message.video.mime_type || 'video/mp4', filename: 'video.mp4', caption: ctx.message.caption,
    })
  })

  bot.catch(err => {
    logger.error({ err }, 'Bot error')
  })

  return bot
}
