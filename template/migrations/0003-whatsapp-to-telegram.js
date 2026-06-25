// 0003-whatsapp-to-telegram
//
// WhatsApp was retired in v1.0. Flip any whatsapp-channel install onto Telegram and
// strip the dead WhatsApp keys from BOTH .env (via ctx.env, persisted by writeEnv)
// and bundle.json (via patchBundle, so the next reload doesn't resurrect them).
// writeEnv already coerces MESSAGING_CHANNEL=telegram on every render; this makes it
// durable in bundle.json, records the move once, and tells the owner to pair
// Telegram. The missing-key report then surfaces TELEGRAM_BOT_TOKEN if it's absent.

export default {
  id: '0003-whatsapp-to-telegram',
  description: 'retire WhatsApp; move the install onto Telegram',

  // Needed only for an install still carrying a WhatsApp channel/number.
  detect(ctx) {
    const env = ctx.env || {}
    const b = ctx.bundle || {}
    return String(env.MESSAGING_CHANNEL || '').toLowerCase() === 'whatsapp'
      || !!env.WHATSAPP_OWNER_NUMBER
      || String(b.messagingChannel || '').toLowerCase() === 'whatsapp'
  },

  run(ctx) {
    ctx.env.MESSAGING_CHANNEL = 'telegram'
    delete ctx.env.WHATSAPP_OWNER_NUMBER
    delete ctx.env.WHATSAPP_SESSION_DIR
    ctx.patchBundle((b) => {
      b.messagingChannel = 'telegram'
      if (b.keys) {
        delete b.keys.WHATSAPP_OWNER_NUMBER
        delete b.keys.WHATSAPP_SESSION_DIR
      }
    })
    ctx.ok('moved onto Telegram (WhatsApp retired). If the bot is not paired yet, run /connect-telegram.')
  },
}
