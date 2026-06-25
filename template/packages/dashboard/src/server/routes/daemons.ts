import { Router } from 'express'
import { getTelegramState, pauseTelegram, resumeTelegram, logger } from '@nello/core'

export function daemonsRouter(): Router {
  const r = Router()

  r.get('/', (_req, res) => {
    res.json({ telegram: getTelegramState() })
  })

  r.post('/telegram/start', (_req, res) => {
    resumeTelegram()
    logger.info('[daemons] Telegram start via API')
    res.json({ ok: true, telegram: getTelegramState() })
  })

  r.post('/telegram/stop', async (_req, res) => {
    try {
      await pauseTelegram()
      logger.info('[daemons] Telegram stop via API')
      res.json({ ok: true, telegram: getTelegramState() })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  return r
}
